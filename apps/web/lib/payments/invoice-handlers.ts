import type { SupabaseClient } from '@supabase/supabase-js'

import { formatUsd } from '@/lib/pricing/premium'
import { createAdminClient } from '@/lib/supabase/admin'

import {
  createSupabaseInvoiceStore,
  paymentEventIds,
  refundStatusAfter,
  REFUNDABLE_STATUSES,
  type InvoicePaymentStatus,
  type InvoiceStore,
} from './invoice-charge'
import { NMI_EVENT_TYPES, registerNmiHandler } from './nmi-handlers'
import type { NmiWebhookEvent } from './nmi-types'

/**
 * NMI webhook handlers for invoice payments. Registered on module evaluation;
 * `app/api/webhooks/nmi/route.ts` imports this module so the registry on that
 * route is populated.
 *
 * Every handler is idempotent: the same event can arrive twice (a claim
 * takeover after a crash, or a retry after the row could not be marked
 * processed; see docs/PAYMENTS.md), and most of these events describe a
 * transition our own code already applied when it made the gateway call. Each
 * transition is therefore a conditional UPDATE keyed on the current status,
 * and refunds / voids are additionally de-duplicated by the gateway
 * `transaction_id` through a namespaced `payment_events` row.
 *
 * The invoice is found by `order_id`, which `chargeInvoice` sets to the
 * invoice id. Events without a UUID order id (platform charges from Task 5,
 * test transactions from the NMI portal) are ignored.
 */

export type InvoiceWebhookAction =
  | 'ignored'
  | 'noop'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'voided'
  | 'disputed'

export interface InvoiceWebhookResult {
  action: InvoiceWebhookAction
  invoiceId?: string
  reason?: string
}

export interface InvoiceHandlerDeps {
  store: InvoiceStore
  now?: () => Date
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `"12.34"` / `12.34` -> 1234; null when absent or unparsable. */
export function amountToCents(amount: string | number | undefined | null): number | null {
  if (amount === undefined || amount === null || amount === '') return null
  const value = typeof amount === 'number' ? amount : Number(String(amount).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

function isEventType(eventType: string, key: string): boolean {
  return eventType === key || eventType.startsWith(`${key}.`)
}

export async function handleInvoiceWebhookEvent(
  event: NmiWebhookEvent,
  deps: InvoiceHandlerDeps
): Promise<InvoiceWebhookResult> {
  const { store } = deps
  const now = deps.now ?? (() => new Date())
  const body = event.event_body
  const orderId = body.order_id?.trim()

  if (!orderId || !UUID_RE.test(orderId)) {
    return { action: 'ignored', reason: 'order_id is not an invoice id' }
  }

  const invoice = await store.loadInvoice(orderId)
  if (!invoice) {
    console.warn('[nmi] webhook references an unknown invoice', { eventId: event.event_id, orderId })
    return { action: 'ignored', invoiceId: orderId, reason: 'invoice not found' }
  }

  const transactionId = body.transaction_id?.trim() || ''
  const amountCents = amountToCents(body.action?.amount)
  const type = event.event_type
  const status = invoice.paymentStatus

  // ---- transaction.sale.success --------------------------------------
  if (type === NMI_EVENT_TYPES.saleSuccess) {
    if (status === 'paid' || status === 'partially_refunded' || status === 'refunded' || status === 'disputed') {
      if (transactionId && invoice.gatewayTransactionId && invoice.gatewayTransactionId !== transactionId) {
        console.warn('[nmi] sale.success for an invoice already paid by a different transaction', {
          invoiceId: invoice.id,
          recorded: invoice.gatewayTransactionId,
          received: transactionId,
        })
      }
      return { action: 'noop', invoiceId: invoice.id }
    }
    if (amountCents !== null && amountCents !== invoice.totalAmount) {
      console.error('[nmi] sale.success amount does not match the invoice; not marking paid', {
        invoiceId: invoice.id,
        expected: invoice.totalAmount,
        received: amountCents,
      })
      return { action: 'ignored', invoiceId: invoice.id, reason: 'amount mismatch' }
    }

    const at = now()
    const updated = await store.updateInvoice(
      invoice.id,
      {
        payment_status: 'paid',
        is_paid: true,
        paid_at: at.toISOString(),
        gateway_transaction_id: transactionId || invoice.gatewayTransactionId,
        failure_reason: null,
      },
      { statusIn: ['unpaid', 'processing', 'failed'] }
    )
    if (!updated) return { action: 'noop', invoiceId: invoice.id }

    if (transactionId) {
      await store.insertPaymentEvent({
        provider: 'nmi',
        provider_event_id: paymentEventIds.sale(transactionId),
        event_type: 'transaction.sale.approved',
        payload: { source: 'webhook', webhook_event_id: event.event_id, invoice_id: invoice.id, ...body },
        processed: true,
        processed_at: at.toISOString(),
      })
    }
    await store.notify(
      invoice.buyerId,
      'Payment received',
      `Your card on file was charged ${formatUsd(invoice.totalAmount)} for lot #${invoice.lot.lotNumber}: ${invoice.lot.title}.`,
      'payment_received'
    )
    return { action: 'paid', invoiceId: invoice.id }
  }

  // ---- transaction.sale.failure --------------------------------------
  if (type === NMI_EVENT_TYPES.saleFailure) {
    const reason = body.action?.response_text?.trim() || 'Declined by the gateway'
    if (status === 'processing') {
      const updated = await store.updateInvoice(
        invoice.id,
        { payment_status: 'failed', failure_reason: reason, last_attempt_at: now().toISOString() },
        { statusIn: ['processing'] }
      )
      return { action: updated ? 'failed' : 'noop', invoiceId: invoice.id }
    }
    if (status === 'unpaid' || status === 'failed') {
      await store.updateInvoice(invoice.id, { failure_reason: reason }, { statusIn: ['unpaid', 'failed'] })
      return { action: 'failed', invoiceId: invoice.id }
    }
    return { action: 'noop', invoiceId: invoice.id }
  }

  // ---- transaction.refund.success ------------------------------------
  if (type === NMI_EVENT_TYPES.refundSuccess) {
    if (!transactionId) return { action: 'ignored', invoiceId: invoice.id, reason: 'no transaction_id' }
    if (await store.hasPaymentEvent(paymentEventIds.refund(transactionId))) {
      return { action: 'noop', invoiceId: invoice.id }
    }
    if (!REFUNDABLE_STATUSES.includes(status)) return { action: 'noop', invoiceId: invoice.id }
    if (amountCents === null) {
      console.error('[nmi] refund.success without an amount; not applied', { invoiceId: invoice.id, transactionId })
      return { action: 'ignored', invoiceId: invoice.id, reason: 'no amount' }
    }

    const next = refundStatusAfter(invoice.totalAmount, invoice.refundedCents, amountCents)
    const at = now()
    const updated = await store.updateInvoice(
      invoice.id,
      { payment_status: next.status, is_paid: next.status !== 'refunded', refunded_cents: next.refundedCents },
      { statusIn: REFUNDABLE_STATUSES, refundedCents: invoice.refundedCents }
    )
    if (!updated) return { action: 'noop', invoiceId: invoice.id }

    await store.insertPaymentEvent({
      provider: 'nmi',
      provider_event_id: paymentEventIds.refund(transactionId),
      event_type: 'transaction.refund.approved',
      payload: { source: 'webhook', webhook_event_id: event.event_id, invoice_id: invoice.id, amount_cents: amountCents, ...body },
      processed: true,
      processed_at: at.toISOString(),
    })
    await store.notify(
      invoice.buyerId,
      'Refund issued',
      `${formatUsd(amountCents)} for lot #${invoice.lot.lotNumber}: ${invoice.lot.title} is on its way back to your card.`,
      'payment_refunded'
    )
    return { action: next.status, invoiceId: invoice.id }
  }

  // ---- transaction.void.success --------------------------------------
  if (type === NMI_EVENT_TYPES.voidSuccess) {
    if (!transactionId) return { action: 'ignored', invoiceId: invoice.id, reason: 'no transaction_id' }
    if (await store.hasPaymentEvent(paymentEventIds.void(transactionId))) {
      return { action: 'noop', invoiceId: invoice.id }
    }
    if (status !== 'paid' && status !== 'partially_refunded') return { action: 'noop', invoiceId: invoice.id }
    if (invoice.gatewayTransactionId && invoice.gatewayTransactionId !== transactionId) {
      console.warn("[nmi] void.success for a transaction that is not this invoice's sale; ignored", {
        invoiceId: invoice.id,
        recorded: invoice.gatewayTransactionId,
        received: transactionId,
      })
      return { action: 'ignored', invoiceId: invoice.id, reason: 'transaction mismatch' }
    }

    const at = now()
    const updated = await store.updateInvoice(
      invoice.id,
      {
        payment_status: 'refunded',
        is_paid: false,
        refunded_cents: invoice.totalAmount,
        failure_reason: 'Sale voided at the gateway',
      },
      { statusIn: ['paid', 'partially_refunded'] }
    )
    if (!updated) return { action: 'noop', invoiceId: invoice.id }

    await store.insertPaymentEvent({
      provider: 'nmi',
      provider_event_id: paymentEventIds.void(transactionId),
      event_type: 'transaction.void.approved',
      payload: { source: 'webhook', webhook_event_id: event.event_id, invoice_id: invoice.id, ...body },
      processed: true,
      processed_at: at.toISOString(),
    })
    await store.notify(
      invoice.buyerId,
      'Charge voided',
      `The ${formatUsd(invoice.totalAmount)} charge for lot #${invoice.lot.lotNumber}: ${invoice.lot.title} was voided before it settled.`,
      'payment_refunded'
    )
    return { action: 'voided', invoiceId: invoice.id }
  }

  // ---- chargeback.* / dispute.* ----------------------------------------
  if (isEventType(type, NMI_EVENT_TYPES.chargeback) || isEventType(type, NMI_EVENT_TYPES.dispute)) {
    if (status === 'disputed') return { action: 'noop', invoiceId: invoice.id }
    const disputable: InvoicePaymentStatus[] = ['paid', 'partially_refunded', 'refunded']
    if (!disputable.includes(status)) {
      console.warn('[nmi] dispute event for an invoice that was never paid; ignored', {
        invoiceId: invoice.id,
        status,
        eventType: type,
      })
      return { action: 'ignored', invoiceId: invoice.id, reason: `invoice is ${status}` }
    }

    const updated = await store.updateInvoice(
      invoice.id,
      { payment_status: 'disputed', failure_reason: `Dispute opened (${type})` },
      { statusIn: disputable }
    )
    if (!updated) return { action: 'noop', invoiceId: invoice.id }

    const admins = await store.listAdminUserIds()
    const message =
      `A ${type} event arrived for invoice ${invoice.id} (lot #${invoice.lot.lotNumber}: ${invoice.lot.title}, ` +
      `${formatUsd(invoice.totalAmount)}, auctioneer ${invoice.auctioneer.id}` +
      (transactionId ? `, transaction ${transactionId}` : '') +
      '). The invoice is now marked disputed; respond in the gateway portal.'
    for (const adminId of admins) {
      await store.notify(adminId, 'Chargeback opened', message, 'payment_dispute')
    }
    return { action: 'disputed', invoiceId: invoice.id }
  }

  return { action: 'ignored', invoiceId: invoice.id, reason: `no invoice rule for ${type}` }
}

// ---------------------------------------------------------------------------
// Registration (module side effect)
// ---------------------------------------------------------------------------

let defaultStore: InvoiceStore | undefined
function productionDeps(): InvoiceHandlerDeps {
  if (!defaultStore) {
    defaultStore = createSupabaseInvoiceStore(() => createAdminClient() as unknown as SupabaseClient)
  }
  return { store: defaultStore }
}

const HANDLED_TYPES = [
  NMI_EVENT_TYPES.saleSuccess,
  NMI_EVENT_TYPES.saleFailure,
  NMI_EVENT_TYPES.refundSuccess,
  NMI_EVENT_TYPES.voidSuccess,
  NMI_EVENT_TYPES.chargeback,
  NMI_EVENT_TYPES.dispute,
] as const

for (const eventType of HANDLED_TYPES) {
  registerNmiHandler(eventType, async (event) => {
    const result = await handleInvoiceWebhookEvent(event, productionDeps())
    console.info('[nmi] invoice webhook handled', {
      eventId: event.event_id,
      eventType: event.event_type,
      ...result,
    })
  })
}

/** Event types this module registers (for docs and tests). */
export const INVOICE_WEBHOOK_EVENT_TYPES: readonly string[] = HANDLED_TYPES
