import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { formatPremiumPercent, formatUsd } from '@/lib/pricing/premium'
import { createAdminClient } from '@/lib/supabase/admin'

import { friendlyGatewayMessage } from './methods'
import { isApproved, refund as nmiRefund, sale as nmiSale } from './nmi'
import type { NmiResponse, RefundOptions, SaleOptions } from './nmi-types'

/**
 * Charging a won invoice to the bidder's card on file, under the auctioneer's
 * merchant account (`auctioneers.gateway_processor_id`), and refunding it.
 *
 * State machine (`invoices.payment_status`, migration 021):
 *
 *   unpaid ──┐
 *            ├─> processing ──> paid ──> partially_refunded ──> refunded
 *   failed ──┘       │           │
 *      ^             │           └────> disputed (chargeback webhook)
 *      └─────────────┘ (decline / gateway error / no card)
 *
 * Every transition is a conditional UPDATE (`WHERE payment_status IN (...)`),
 * so two callers racing on the same invoice (the close route, the retry cron,
 * a bidder pressing "Retry payment") cannot both charge it: only the one that
 * moves the row to `processing` talks to the gateway. Money is integer cents.
 *
 * The gateway client, the store and the clock are injectable so the whole flow
 * is unit-tested without a network or a database (tests/unit/invoice-charge.spec.ts).
 */

export type InvoicePaymentStatus =
  | 'unpaid'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'

/** States a charge may start from. Everything else is a no-op. */
export const CHARGEABLE_STATUSES: readonly InvoicePaymentStatus[] = ['unpaid', 'failed']

/** States a refund may start from. */
export const REFUNDABLE_STATUSES: readonly InvoicePaymentStatus[] = ['paid', 'partially_refunded']

/** The retry cron gives up after this many attempts. */
export const MAX_CHARGE_ATTEMPTS = 3

/** Namespaced `payment_events.provider_event_id` values for events we originate. */
export const paymentEventIds = {
  sale: (transactionId: string) => `nmi-sale:${transactionId}`,
  refund: (transactionId: string) => `nmi-refund:${transactionId}`,
  void: (transactionId: string) => `nmi-void:${transactionId}`,
}

export interface ChargeableInvoice {
  id: string
  lotId: string
  buyerId: string
  hammerPrice: number
  buyerPremiumPercent: number
  totalAmount: number
  paymentStatus: InvoicePaymentStatus
  gatewayTransactionId: string | null
  attempts: number
  refundedCents: number
  lot: { lotNumber: number; title: string }
  auction: { id: string; title: string }
  auctioneer: { id: string; userId: string; gatewayProcessorId: string | null; paymentsEnabled: boolean }
}

export interface InvoicePatch {
  payment_status?: InvoicePaymentStatus
  is_paid?: boolean
  paid_at?: string | null
  gateway_transaction_id?: string | null
  failure_reason?: string | null
  attempts?: number
  last_attempt_at?: string | null
  refunded_cents?: number
}

export interface InvoiceUpdateGuard {
  /** The UPDATE only applies while the row is in one of these states. */
  statusIn: readonly InvoicePaymentStatus[]
  /** Optimistic guard for refunds: the row's current refunded_cents must still equal this. */
  refundedCents?: number
}

export interface PaymentEventInsert {
  provider: 'nmi'
  provider_event_id: string
  event_type: string
  payload: Record<string, unknown>
  processed: boolean
  processed_at: string | null
}

export interface InvoiceStore {
  loadInvoice(invoiceId: string): Promise<ChargeableInvoice | null>
  /** The bidder's verified Customer Vault id, or null when no verified card is on file. */
  loadVerifiedVaultId(userId: string): Promise<string | null>
  /** Conditional UPDATE. Resolves false when the guard did not match (the row moved on). */
  updateInvoice(invoiceId: string, patch: InvoicePatch, guard: InvoiceUpdateGuard): Promise<boolean>
  /** Insert unless a row with the same provider_event_id exists. */
  insertPaymentEvent(row: PaymentEventInsert): Promise<void>
  hasPaymentEvent(providerEventId: string): Promise<boolean>
  notify(userId: string, title: string, message: string, type: string): Promise<void>
  listAdminUserIds(): Promise<string[]>
}

export interface NmiGateway {
  sale(options: SaleOptions): Promise<NmiResponse>
  refund(options: RefundOptions): Promise<NmiResponse>
}

export interface InvoiceChargeDeps {
  store?: InvoiceStore
  nmi?: NmiGateway
  now?: () => Date
}

const defaultGateway: NmiGateway = {
  sale: (options) => nmiSale(options),
  refund: (options) => nmiRefund(options),
}

function resolveDeps(deps: InvoiceChargeDeps) {
  return {
    store: deps.store ?? createSupabaseInvoiceStore(() => createAdminClient() as unknown as SupabaseClient),
    nmi: deps.nmi ?? defaultGateway,
    now: deps.now ?? (() => new Date()),
  }
}

export type ChargeInvoiceResult =
  | { outcome: 'paid'; invoiceId: string; transactionId: string; amountCents: number }
  | { outcome: 'declined'; invoiceId: string; reason: string; attempts: number }
  | { outcome: 'error'; invoiceId: string; reason: string; attempts: number }
  /** A precondition failed (no verified card, auctioneer cannot take payments). Recorded as `failed`. */
  | { outcome: 'blocked'; invoiceId: string; reason: string; attempts: number }
  /** Not in a chargeable state (already paid, in flight, refunded, disputed). Nothing was done. */
  | { outcome: 'skipped'; invoiceId: string; status: InvoicePaymentStatus }
  | { outcome: 'not_found'; invoiceId: string }

function lotLabel(invoice: ChargeableInvoice): string {
  return `lot #${invoice.lot.lotNumber}: ${invoice.lot.title}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function recordFailure(
  store: InvoiceStore,
  invoice: ChargeableInvoice,
  reason: string,
  at: Date,
  guard: InvoiceUpdateGuard
): Promise<number> {
  const attempts = invoice.attempts + 1
  const updated = await store.updateInvoice(
    invoice.id,
    {
      payment_status: 'failed',
      failure_reason: reason,
      attempts,
      last_attempt_at: at.toISOString(),
    },
    guard
  )
  if (!updated) {
    console.warn('[invoice-charge] failure not recorded; invoice moved on concurrently', {
      invoiceId: invoice.id,
      reason,
    })
  }
  return attempts
}

async function notifyPaymentFailed(store: InvoiceStore, invoice: ChargeableInvoice, reason: string): Promise<void> {
  await store.notify(
    invoice.buyerId,
    'Payment failed, update your card',
    `We could not charge ${formatUsd(invoice.totalAmount)} for ${lotLabel(invoice)} (${reason}). ` +
      'Update your card on file and we will try again.',
    'payment_failed'
  )
}

/**
 * Charge one invoice. Idempotent: an invoice that is already `processing` or
 * `paid` (or refunded / disputed) is left alone and reported as `skipped`.
 */
export async function chargeInvoice(invoiceId: string, deps: InvoiceChargeDeps = {}): Promise<ChargeInvoiceResult> {
  const { store, nmi, now } = resolveDeps(deps)

  const invoice = await store.loadInvoice(invoiceId)
  if (!invoice) return { outcome: 'not_found', invoiceId }
  if (!CHARGEABLE_STATUSES.includes(invoice.paymentStatus)) {
    return { outcome: 'skipped', invoiceId, status: invoice.paymentStatus }
  }

  // Preconditions that no retry of the same request can fix. Recorded as a
  // failed attempt so the dashboards show why, and so the retry cron picks
  // the invoice up once the bidder updates their card.
  const { auctioneer } = invoice
  if (!auctioneer.paymentsEnabled || !auctioneer.gatewayProcessorId) {
    const reason = 'Auctioneer merchant account is not enabled for payments'
    console.error('[invoice-charge] blocked', { invoiceId, auctioneerId: auctioneer.id, reason })
    const attempts = await recordFailure(store, invoice, reason, now(), { statusIn: CHARGEABLE_STATUSES })
    return { outcome: 'blocked', invoiceId, reason, attempts }
  }

  const vaultId = await store.loadVerifiedVaultId(invoice.buyerId)
  if (!vaultId) {
    const reason = 'No verified card on file'
    const attempts = await recordFailure(store, invoice, reason, now(), { statusIn: CHARGEABLE_STATUSES })
    await notifyPaymentFailed(store, invoice, reason)
    return { outcome: 'blocked', invoiceId, reason, attempts }
  }

  // Claim the row. Exactly one concurrent caller gets past this line.
  const startedAt = now()
  const claimed = await store.updateInvoice(
    invoice.id,
    { payment_status: 'processing', last_attempt_at: startedAt.toISOString() },
    { statusIn: CHARGEABLE_STATUSES }
  )
  if (!claimed) {
    const current = await store.loadInvoice(invoiceId)
    return { outcome: 'skipped', invoiceId, status: current?.paymentStatus ?? 'processing' }
  }

  let response: NmiResponse
  try {
    response = await nmi.sale({
      customerVaultId: vaultId,
      amountCents: invoice.totalAmount,
      processorId: auctioneer.gatewayProcessorId,
      orderId: invoice.id,
      orderDescription: `${invoice.auction.title} lot ${invoice.lot.lotNumber}`,
      merchantDefinedFields: [invoice.id, invoice.lotId, auctioneer.id],
    })
  } catch (error) {
    const reason = `Gateway error: ${errorMessage(error)}`
    console.error('[invoice-charge] gateway call failed', { invoiceId, error })
    const attempts = await recordFailure(store, invoice, reason, now(), { statusIn: ['processing'] })
    return { outcome: 'error', invoiceId, reason, attempts }
  }

  if (!isApproved(response)) {
    const reason = friendlyGatewayMessage(response.responsetext)
    const attempts = await recordFailure(store, invoice, reason, now(), { statusIn: ['processing'] })
    await notifyPaymentFailed(store, invoice, reason)
    return { outcome: 'declined', invoiceId, reason, attempts }
  }

  const paidAt = now()
  const transactionId = response.transactionid

  // Record the gateway's answer before anything else: if the invoice update
  // below fails, this row is what reconciliation works from.
  await store.insertPaymentEvent({
    provider: 'nmi',
    provider_event_id: paymentEventIds.sale(transactionId),
    event_type: 'transaction.sale.approved',
    payload: {
      source: 'invoice-charge',
      invoice_id: invoice.id,
      lot_id: invoice.lotId,
      auctioneer_id: auctioneer.id,
      processor_id: auctioneer.gatewayProcessorId,
      amount_cents: invoice.totalAmount,
      transactionid: transactionId,
      authcode: response.authcode,
      response_code: response.response_code,
      responsetext: response.responsetext,
      avsresponse: response.avsresponse,
      cvvresponse: response.cvvresponse,
      orderid: response.orderid,
    },
    processed: true,
    processed_at: paidAt.toISOString(),
  })

  const marked = await store.updateInvoice(
    invoice.id,
    {
      payment_status: 'paid',
      is_paid: true,
      paid_at: paidAt.toISOString(),
      gateway_transaction_id: transactionId,
      failure_reason: null,
      attempts: invoice.attempts + 1,
      last_attempt_at: startedAt.toISOString(),
    },
    { statusIn: ['processing'] }
  )
  if (!marked) {
    // The card was charged; the row must say so. Loud, because a human has to look.
    console.error('[invoice-charge] SALE APPROVED BUT INVOICE NOT MARKED PAID; reconcile from payment_events', {
      invoiceId,
      transactionId,
    })
  }

  await store.notify(
    invoice.buyerId,
    'Payment received',
    `Your card on file was charged ${formatUsd(invoice.totalAmount)} for ${lotLabel(invoice)} ` +
      `(hammer ${formatUsd(invoice.hammerPrice)} + ${formatPremiumPercent(invoice.buyerPremiumPercent)} buyer's premium).`,
    'payment_received'
  )

  return { outcome: 'paid', invoiceId, transactionId, amountCents: invoice.totalAmount }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundAmountResolution =
  | { ok: true; amountCents: number; full: boolean }
  | { ok: false; reason: string }

/**
 * Decide how much to refund. No requested amount means "everything not yet
 * refunded". A partial amount must be a positive integer number of cents no
 * larger than what remains.
 */
export function resolveRefundAmount(
  totalCents: number,
  refundedCents: number,
  requestedCents?: number | null
): RefundAmountResolution {
  const remaining = totalCents - refundedCents
  if (remaining <= 0) return { ok: false, reason: 'Invoice is already fully refunded' }

  if (requestedCents === undefined || requestedCents === null) {
    return { ok: true, amountCents: remaining, full: true }
  }
  if (!Number.isSafeInteger(requestedCents) || requestedCents <= 0) {
    return { ok: false, reason: 'Refund amount must be a positive whole number of cents' }
  }
  if (requestedCents > remaining) {
    return { ok: false, reason: `Refund amount exceeds the ${formatUsd(remaining)} remaining on this invoice` }
  }
  return { ok: true, amountCents: requestedCents, full: requestedCents === remaining }
}

/** New `refunded_cents` and status after refunding `amountCents` more. Clamped to the total. */
export function refundStatusAfter(
  totalCents: number,
  refundedBefore: number,
  amountCents: number
): { refundedCents: number; status: 'refunded' | 'partially_refunded' } {
  const refundedCents = Math.min(totalCents, refundedBefore + Math.max(0, amountCents))
  return { refundedCents, status: refundedCents >= totalCents ? 'refunded' : 'partially_refunded' }
}

export type RefundInvoiceResult =
  | {
      outcome: 'refunded'
      invoiceId: string
      transactionId: string
      amountCents: number
      refundedCents: number
      status: 'refunded' | 'partially_refunded'
    }
  | { outcome: 'declined'; invoiceId: string; reason: string }
  | { outcome: 'error'; invoiceId: string; reason: string }
  | { outcome: 'not_refundable'; invoiceId: string; status: InvoicePaymentStatus; reason: string }
  | { outcome: 'invalid_amount'; invoiceId: string; reason: string }
  | { outcome: 'not_found'; invoiceId: string }

export interface RefundInvoiceOptions {
  /** Omit for a full refund of whatever remains. */
  amountCents?: number | null
  /** Who asked (for the payment_events payload). */
  requestedBy?: string
}

/**
 * Refund part or all of a paid invoice through the gateway, then move the
 * invoice to `partially_refunded` / `refunded`. The gateway is called first
 * and the row updated with an optimistic guard on `refunded_cents`, so two
 * simultaneous refunds cannot both be recorded; a lost race is logged loudly
 * because the second gateway refund still happened.
 */
export async function refundInvoice(
  invoiceId: string,
  options: RefundInvoiceOptions = {},
  deps: InvoiceChargeDeps = {}
): Promise<RefundInvoiceResult> {
  const { store, nmi, now } = resolveDeps(deps)

  const invoice = await store.loadInvoice(invoiceId)
  if (!invoice) return { outcome: 'not_found', invoiceId }
  if (!REFUNDABLE_STATUSES.includes(invoice.paymentStatus)) {
    return {
      outcome: 'not_refundable',
      invoiceId,
      status: invoice.paymentStatus,
      reason: `Invoice is ${invoice.paymentStatus.replace('_', ' ')}; only paid invoices can be refunded`,
    }
  }
  if (!invoice.gatewayTransactionId) {
    return {
      outcome: 'not_refundable',
      invoiceId,
      status: invoice.paymentStatus,
      reason: 'Invoice has no gateway transaction to refund',
    }
  }

  const resolved = resolveRefundAmount(invoice.totalAmount, invoice.refundedCents, options.amountCents)
  if (!resolved.ok) return { outcome: 'invalid_amount', invoiceId, reason: resolved.reason }

  let response: NmiResponse
  try {
    response = await nmi.refund({
      transactionId: invoice.gatewayTransactionId,
      // A full refund of an untouched sale omits the amount (NMI refunds the
      // whole transaction); after a partial refund the remainder is explicit.
      amountCents: resolved.full && invoice.refundedCents === 0 ? undefined : resolved.amountCents,
    })
  } catch (error) {
    const reason = `Gateway error: ${errorMessage(error)}`
    console.error('[invoice-charge] refund call failed', { invoiceId, error })
    return { outcome: 'error', invoiceId, reason }
  }

  if (!isApproved(response)) {
    return { outcome: 'declined', invoiceId, reason: friendlyGatewayMessage(response.responsetext) }
  }

  const at = now()
  const refundTransactionId = response.transactionid || `${invoice.gatewayTransactionId}:${at.getTime()}`
  const next = refundStatusAfter(invoice.totalAmount, invoice.refundedCents, resolved.amountCents)

  await store.insertPaymentEvent({
    provider: 'nmi',
    provider_event_id: paymentEventIds.refund(refundTransactionId),
    event_type: 'transaction.refund.approved',
    payload: {
      source: 'invoice-refund',
      invoice_id: invoice.id,
      lot_id: invoice.lotId,
      auctioneer_id: invoice.auctioneer.id,
      sale_transaction_id: invoice.gatewayTransactionId,
      amount_cents: resolved.amountCents,
      refunded_cents_after: next.refundedCents,
      requested_by: options.requestedBy ?? null,
      transactionid: response.transactionid,
      response_code: response.response_code,
      responsetext: response.responsetext,
    },
    processed: true,
    processed_at: at.toISOString(),
  })

  const updated = await store.updateInvoice(
    invoice.id,
    {
      payment_status: next.status,
      is_paid: next.status !== 'refunded',
      refunded_cents: next.refundedCents,
    },
    { statusIn: REFUNDABLE_STATUSES, refundedCents: invoice.refundedCents }
  )
  if (!updated) {
    console.error('[invoice-charge] REFUND APPROVED BUT INVOICE NOT UPDATED (concurrent refund?); reconcile from payment_events', {
      invoiceId,
      refundTransactionId,
      amountCents: resolved.amountCents,
    })
  }

  await store.notify(
    invoice.buyerId,
    'Refund issued',
    `${formatUsd(resolved.amountCents)} for ${lotLabel(invoice)} is on its way back to your card. ` +
      'Refunds usually appear within 5 to 10 business days.',
    'payment_refunded'
  )

  return {
    outcome: 'refunded',
    invoiceId,
    transactionId: refundTransactionId,
    amountCents: resolved.amountCents,
    refundedCents: next.refundedCents,
    status: next.status,
  }
}

// ---------------------------------------------------------------------------
// Retry selection (used by the daily cron)
// ---------------------------------------------------------------------------

export interface RetryCandidate {
  id: string
  buyer_id: string
  payment_status: InvoicePaymentStatus
  attempts: number
  last_attempt_at: string | null
  created_at: string
}

export interface CardOnFileTimestamp {
  user_id: string
  updated_at: string
  verified_at: string | null
}

/** An `unpaid` invoice that nobody has tried to charge yet is picked up after this long. */
export const UNATTEMPTED_GRACE_MS = 10 * 60 * 1000

/**
 * Which invoices the daily cron should charge:
 *   - `failed`, fewer than MAX_CHARGE_ATTEMPTS attempts, and the bidder saved a
 *     (verified) card after the last attempt; or
 *   - `unpaid` with no attempt at all and older than the grace period (the
 *     close request timed out before reaching it).
 * Pure so the rule is unit-tested.
 */
export function selectRetryableInvoices(
  invoices: RetryCandidate[],
  cards: CardOnFileTimestamp[],
  now: Date
): string[] {
  const cardByUser = new Map(cards.map((card) => [card.user_id, card]))
  const nowMs = now.getTime()
  const selected: string[] = []

  for (const invoice of invoices) {
    if (invoice.payment_status === 'unpaid') {
      if (invoice.attempts === 0 && nowMs - new Date(invoice.created_at).getTime() >= UNATTEMPTED_GRACE_MS) {
        selected.push(invoice.id)
      }
      continue
    }
    if (invoice.payment_status !== 'failed') continue
    if (invoice.attempts >= MAX_CHARGE_ATTEMPTS) continue

    const card = cardByUser.get(invoice.buyer_id)
    if (!card || !card.verified_at) continue
    const lastAttempt = invoice.last_attempt_at ? new Date(invoice.last_attempt_at).getTime() : 0
    if (new Date(card.updated_at).getTime() > lastAttempt) selected.push(invoice.id)
  }

  return selected
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface RawInvoiceRow {
  id: string
  lot_id: string
  buyer_id: string
  hammer_price: number
  buyer_premium_percent: number | string
  total_amount: number
  payment_status: InvoicePaymentStatus
  gateway_transaction_id: string | null
  attempts: number | null
  refunded_cents: number | null
  lot: {
    lot_number: number
    title: string
    auction: {
      id: string
      title: string
      auctioneer: {
        id: string
        user_id: string
        gateway_processor_id: string | null
        payments_enabled: boolean | null
      }
    }
  }
}

const INVOICE_SELECT = `
  id, lot_id, buyer_id, hammer_price, buyer_premium_percent, total_amount,
  payment_status, gateway_transaction_id, attempts, refunded_cents,
  lot:lots!inner(
    lot_number, title,
    auction:auctions!inner(
      id, title,
      auctioneer:auctioneers!inner(id, user_id, gateway_processor_id, payments_enabled)
    )
  )
`

export function toChargeableInvoice(row: RawInvoiceRow): ChargeableInvoice {
  return {
    id: row.id,
    lotId: row.lot_id,
    buyerId: row.buyer_id,
    hammerPrice: row.hammer_price,
    buyerPremiumPercent: Number(row.buyer_premium_percent),
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status,
    gatewayTransactionId: row.gateway_transaction_id,
    attempts: row.attempts ?? 0,
    refundedCents: row.refunded_cents ?? 0,
    lot: { lotNumber: row.lot.lot_number, title: row.lot.title },
    auction: { id: row.lot.auction.id, title: row.lot.auction.title },
    auctioneer: {
      id: row.lot.auction.auctioneer.id,
      userId: row.lot.auction.auctioneer.user_id,
      gatewayProcessorId: row.lot.auction.auctioneer.gateway_processor_id,
      paymentsEnabled: row.lot.auction.auctioneer.payments_enabled === true,
    },
  }
}

/**
 * Service-role store. Untyped client on purpose: the hand-written Database
 * type resolves `.update()` values to `never` (see lib/payments/methods.ts).
 */
export function createSupabaseInvoiceStore(getClient: () => SupabaseClient): InvoiceStore {
  let client: SupabaseClient | undefined
  const db = () => {
    if (!client) client = getClient()
    return client
  }
  const failure = (step: string, error: { message: string }) => new Error(`invoices ${step} failed: ${error.message}`)

  return {
    async loadInvoice(invoiceId) {
      const { data, error } = await db().from('invoices').select(INVOICE_SELECT).eq('id', invoiceId).maybeSingle()
      if (error) throw failure('load', error)
      if (!data) return null
      return toChargeableInvoice(data as unknown as RawInvoiceRow)
    },

    async loadVerifiedVaultId(userId) {
      const { data, error } = await db()
        .from('bidder_payment_methods')
        .select('customer_vault_id')
        .eq('user_id', userId)
        .not('verified_at', 'is', null)
        .maybeSingle()
      if (error) throw failure('load card', error)
      return (data?.customer_vault_id as string | undefined) ?? null
    },

    async updateInvoice(invoiceId, patch, guard) {
      let query = db()
        .from('invoices')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', invoiceId)
        .in('payment_status', [...guard.statusIn])
      if (guard.refundedCents !== undefined) query = query.eq('refunded_cents', guard.refundedCents)
      const { data, error } = await query.select('id')
      if (error) throw failure('update', error)
      return (data?.length ?? 0) > 0
    },

    async insertPaymentEvent(row) {
      const { error } = await db()
        .from('payment_events')
        .upsert({ id: randomUUID(), ...row }, { onConflict: 'provider_event_id', ignoreDuplicates: true })
      if (error) throw new Error(`payment_events insert failed: ${error.message}`)
    },

    async hasPaymentEvent(providerEventId) {
      const { data, error } = await db()
        .from('payment_events')
        .select('id')
        .eq('provider_event_id', providerEventId)
        .maybeSingle()
      if (error) throw new Error(`payment_events read failed: ${error.message}`)
      return data != null
    },

    async notify(userId, title, message, type) {
      const { error } = await db().from('notifications').insert({ user_id: userId, title, message, type })
      // A missing notification must never undo a payment outcome.
      if (error) console.error('[invoice-charge] notification insert failed', { userId, type, error: error.message })
    },

    async listAdminUserIds() {
      const { data, error } = await db().from('users').select('id').eq('role', 'admin')
      if (error) throw new Error(`users read failed: ${error.message}`)
      return (data ?? []).map((row) => row.id as string)
    },
  }
}
