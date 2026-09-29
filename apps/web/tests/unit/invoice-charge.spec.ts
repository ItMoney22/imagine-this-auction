import { expect, test } from '@playwright/test'

import {
  chargeInvoice,
  MAX_CHARGE_ATTEMPTS,
  refundInvoice,
  notifyUnpaidInvoice,
  refundStatusAfter,
  resolveRefundAmount,
  RETRY_DELAY_MS,
  selectExhaustedInvoices,
  selectRetryableInvoices,
  toChargeableInvoice,
  UNATTEMPTED_GRACE_MS,
  type ChargeableInvoice,
  type InvoiceStore,
  type NmiGateway,
  type PaymentEventInsert,
} from '../../lib/payments/invoice-charge'
import {
  amountToCents,
  handleInvoiceWebhookEvent,
  INVOICE_WEBHOOK_EVENT_TYPES,
} from '../../lib/payments/invoice-handlers'
import type { NmiResponse, NmiWebhookEvent, RefundOptions, SaleOptions } from '../../lib/payments/nmi-types'

/**
 * The charge flow against an in-memory invoice store and a scripted gateway.
 * No network, no database. The store applies the same conditional-update
 * semantics as the Supabase store (guard on payment_status, optional guard on
 * refunded_cents), so the idempotency tests below exercise the real rule.
 */

const NOW = new Date('2026-09-05T15:00:00.000Z')
const clock = { now: () => NOW }

const INVOICE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_INVOICE_ID = '22222222-2222-4222-8222-222222222222'

function invoice(overrides: Partial<ChargeableInvoice> = {}): ChargeableInvoice {
  return {
    id: INVOICE_ID,
    lotId: 'lot-1',
    buyerId: 'buyer-1',
    hammerPrice: 150_000,
    buyerPremiumPercent: 10,
    totalAmount: 165_000,
    paymentStatus: 'unpaid',
    gatewayTransactionId: null,
    attempts: 0,
    refundedCents: 0,
    lot: { lotNumber: 7, title: 'Federal tall case clock' },
    auction: { id: 'auc-1', title: 'Fall Estate Sale' },
    auctioneer: { id: 'auct-1', userId: 'auct-user', gatewayProcessorId: 'proc_abc', paymentsEnabled: true },
    ...overrides,
  }
}

interface Row extends ChargeableInvoice {
  isPaid: boolean
  paidAt: string | null
  failureReason: string | null
  lastAttemptAt: string | null
}

interface Notification {
  userId: string
  title: string
  message: string
  type: string
}

function fakeStore(
  options: {
    invoices?: ChargeableInvoice[]
    vaults?: Record<string, string | null>
    cardIps?: Record<string, string>
    admins?: string[]
  } = {}
) {
  const rows = new Map<string, Row>()
  for (const inv of options.invoices ?? [invoice()]) {
    rows.set(inv.id, { ...inv, isPaid: inv.paymentStatus === 'paid', paidAt: null, failureReason: null, lastAttemptAt: null })
  }
  const events: PaymentEventInsert[] = []
  const notifications: Notification[] = []
  const vaults = options.vaults ?? { 'buyer-1': 'vault-9' }
  const cardIps = options.cardIps ?? { 'buyer-1': '203.0.113.7' }

  const store: InvoiceStore = {
    async loadInvoice(id) {
      const row = rows.get(id)
      if (!row) return null
      const { isPaid: _isPaid, paidAt: _paidAt, failureReason: _reason, lastAttemptAt: _last, ...rest } = row
      return { ...rest }
    },
    async loadVerifiedCard(userId) {
      const vaultId = vaults[userId]
      return vaultId ? { vaultId, lastIp: cardIps[userId] ?? null } : null
    },
    async updateInvoice(id, patch, guard) {
      const row = rows.get(id)
      if (!row) return false
      if (!guard.statusIn.includes(row.paymentStatus)) return false
      if (guard.refundedCents !== undefined && row.refundedCents !== guard.refundedCents) return false
      if (patch.payment_status !== undefined) row.paymentStatus = patch.payment_status
      if (patch.is_paid !== undefined) row.isPaid = patch.is_paid
      if (patch.paid_at !== undefined) row.paidAt = patch.paid_at
      if (patch.gateway_transaction_id !== undefined) row.gatewayTransactionId = patch.gateway_transaction_id
      if (patch.failure_reason !== undefined) row.failureReason = patch.failure_reason
      if (patch.attempts !== undefined) row.attempts = patch.attempts
      if (patch.last_attempt_at !== undefined) row.lastAttemptAt = patch.last_attempt_at
      if (patch.refunded_cents !== undefined) row.refundedCents = patch.refunded_cents
      return true
    },
    async insertPaymentEvent(row) {
      if (!events.some((e) => e.provider_event_id === row.provider_event_id)) events.push(row)
    },
    async hasPaymentEvent(providerEventId) {
      return events.some((e) => e.provider_event_id === providerEventId)
    },
    async notify(userId, title, message, type) {
      notifications.push({ userId, title, message, type })
    },
    async listAdminUserIds() {
      return options.admins ?? []
    },
  }

  return { store, rows, events, notifications }
}

function approved(transactionid = 'tx-1', type = 'sale'): NmiResponse {
  return {
    response: 1,
    responsetext: 'SUCCESS',
    authcode: '123456',
    transactionid,
    avsresponse: 'Y',
    cvvresponse: 'M',
    orderid: INVOICE_ID,
    type,
    response_code: 100,
    raw: {},
  }
}

function declined(responsetext = 'DECLINE REFID:3150929683'): NmiResponse {
  return {
    response: 2,
    responsetext,
    authcode: '',
    transactionid: 'tx-declined',
    avsresponse: 'N',
    cvvresponse: 'N',
    orderid: INVOICE_ID,
    type: 'sale',
    response_code: 200,
    raw: {},
  }
}

function fakeGateway(sales: Array<NmiResponse | Error> = [], refunds: Array<NmiResponse | Error> = []) {
  const saleCalls: SaleOptions[] = []
  const refundCalls: RefundOptions[] = []
  const nmi: NmiGateway = {
    async sale(options) {
      saleCalls.push(options)
      const next = sales.shift() ?? approved()
      if (next instanceof Error) throw next
      return next
    },
    async refund(options) {
      refundCalls.push(options)
      const next = refunds.shift() ?? approved('rf-1', 'refund')
      if (next instanceof Error) throw next
      return next
    },
  }
  return { nmi, saleCalls, refundCalls }
}

test.describe('chargeInvoice', () => {
  test('an approved sale marks the invoice paid, records the gateway event, and tells the bidder', async () => {
    const { store, rows, events, notifications } = fakeStore()
    const { nmi, saleCalls } = fakeGateway([approved('tx-1')])

    const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(result).toEqual({ outcome: 'paid', invoiceId: INVOICE_ID, transactionId: 'tx-1', amountCents: 165_000 })

    // The exact charge: total under the auctioneer's processor, keyed by invoice id.
    expect(saleCalls).toHaveLength(1)
    expect(saleCalls[0]).toEqual({
      customerVaultId: 'vault-9',
      amountCents: 165_000,
      // The bidder's own IP, not this server's: PaymentCloud's per-IP fraud
      // threshold would otherwise count every bidder as one address.
      ipAddress: '203.0.113.7',
      processorId: 'proc_abc',
      orderId: INVOICE_ID,
      orderDescription: 'Fall Estate Sale lot 7',
      merchantDefinedFields: [INVOICE_ID, 'lot-1', 'auct-1'],
    })

    const row = rows.get(INVOICE_ID)!
    expect(row.paymentStatus).toBe('paid')
    expect(row.isPaid).toBe(true)
    expect(row.paidAt).toBe(NOW.toISOString())
    expect(row.gatewayTransactionId).toBe('tx-1')
    expect(row.attempts).toBe(1)
    expect(row.lastAttemptAt).toBe(NOW.toISOString())
    expect(row.failureReason).toBeNull()

    expect(events).toHaveLength(1)
    expect(events[0].provider).toBe('nmi')
    expect(events[0].provider_event_id).toBe('nmi-sale:tx-1')
    expect(events[0].event_type).toBe('transaction.sale.approved')
    expect(events[0].processed).toBe(true)
    expect(events[0].processed_at).toBe(NOW.toISOString())
    expect(events[0].payload).toMatchObject({
      invoice_id: INVOICE_ID,
      lot_id: 'lot-1',
      auctioneer_id: 'auct-1',
      processor_id: 'proc_abc',
      amount_cents: 165_000,
      transactionid: 'tx-1',
      avsresponse: 'Y',
      cvvresponse: 'M',
    })

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ userId: 'buyer-1', title: 'Payment received', type: 'payment_received' })
    expect(notifications[0].message).toContain('$1,650.00')
    expect(notifications[0].message).toContain('10%')
  })

  test('a decline marks the invoice failed with the gateway reason, one attempt, and a fix-your-card notification', async () => {
    const { store, rows, events, notifications } = fakeStore()
    const { nmi } = fakeGateway([declined()])

    const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(result).toEqual({ outcome: 'declined', invoiceId: INVOICE_ID, reason: 'DECLINE', attempts: 1 })
    const row = rows.get(INVOICE_ID)!
    expect(row.paymentStatus).toBe('failed')
    expect(row.isPaid).toBe(false)
    expect(row.attempts).toBe(1)
    expect(row.failureReason).toBe('DECLINE')
    expect(row.lastAttemptAt).toBe(NOW.toISOString())
    expect(row.gatewayTransactionId).toBeNull()
    expect(events).toHaveLength(0)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ userId: 'buyer-1', title: 'Payment failed, update your card', type: 'payment_failed' })
    expect(notifications[0].message).toContain('DECLINE')
  })

  test('charging a paid invoice again is a no-op that never reaches the gateway', async () => {
    const { store, rows, events, notifications } = fakeStore()
    const { nmi, saleCalls } = fakeGateway([approved('tx-1'), approved('tx-2')])

    await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })
    const second = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(second).toEqual({ outcome: 'skipped', invoiceId: INVOICE_ID, status: 'paid' })
    expect(saleCalls).toHaveLength(1)
    expect(rows.get(INVOICE_ID)!.gatewayTransactionId).toBe('tx-1')
    expect(rows.get(INVOICE_ID)!.attempts).toBe(1)
    expect(events).toHaveLength(1)
    expect(notifications).toHaveLength(1)
  })

  test('an invoice another caller is processing is skipped', async () => {
    const { store } = fakeStore({ invoices: [invoice({ paymentStatus: 'processing' })] })
    const { nmi, saleCalls } = fakeGateway()

    const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(result).toEqual({ outcome: 'skipped', invoiceId: INVOICE_ID, status: 'processing' })
    expect(saleCalls).toHaveLength(0)
  })

  test('refunded and disputed invoices are never charged again', async () => {
    for (const status of ['refunded', 'partially_refunded', 'disputed'] as const) {
      const { store } = fakeStore({ invoices: [invoice({ paymentStatus: status })] })
      const { nmi, saleCalls } = fakeGateway()
      const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })
      expect(result).toEqual({ outcome: 'skipped', invoiceId: INVOICE_ID, status })
      expect(saleCalls).toHaveLength(0)
    }
  })

  test('a thrown gateway error records exactly one failed attempt with the error as the reason', async () => {
    const { store, rows, notifications } = fakeStore()
    const { nmi } = fakeGateway([new Error('NMI gateway responded HTTP 502')])

    const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(result).toEqual({
      outcome: 'error',
      invoiceId: INVOICE_ID,
      reason: 'Gateway error: NMI gateway responded HTTP 502',
      attempts: 1,
    })
    const row = rows.get(INVOICE_ID)!
    expect(row.paymentStatus).toBe('failed')
    expect(row.attempts).toBe(1)
    expect(row.failureReason).toBe('Gateway error: NMI gateway responded HTTP 502')
    // A gateway outage is not the bidder's card problem; no "update your card" nag.
    expect(notifications).toHaveLength(0)
  })

  test('a retry after a failure counts the attempt and can succeed', async () => {
    const { store, rows } = fakeStore({ invoices: [invoice({ paymentStatus: 'failed', attempts: 1 })] })
    const { nmi } = fakeGateway([approved('tx-retry')])

    const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(result.outcome).toBe('paid')
    expect(rows.get(INVOICE_ID)!.attempts).toBe(2)
    expect(rows.get(INVOICE_ID)!.gatewayTransactionId).toBe('tx-retry')
  })

  test('a bidder without a verified card is recorded as failed and asked to add one; the gateway is not called', async () => {
    const { store, rows, notifications } = fakeStore({ vaults: { 'buyer-1': null } })
    const { nmi, saleCalls } = fakeGateway()

    const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

    expect(result).toEqual({ outcome: 'blocked', invoiceId: INVOICE_ID, reason: 'No verified card on file', attempts: 1 })
    expect(saleCalls).toHaveLength(0)
    const row = rows.get(INVOICE_ID)!
    expect(row.paymentStatus).toBe('failed')
    expect(row.failureReason).toBe('No verified card on file')
    expect(row.lastAttemptAt).toBe(NOW.toISOString())
    expect(notifications[0]).toMatchObject({ userId: 'buyer-1', type: 'payment_failed' })
  })

  test('an auctioneer without an enabled merchant account blocks the charge without blaming the bidder', async () => {
    const cases: Array<Partial<ChargeableInvoice['auctioneer']>> = [
      { paymentsEnabled: false },
      { gatewayProcessorId: null },
    ]
    for (const override of cases) {
      const base = invoice()
      const { store, rows, notifications } = fakeStore({
        invoices: [invoice({ auctioneer: { ...base.auctioneer, ...override } })],
      })
      const { nmi, saleCalls } = fakeGateway()

      const result = await chargeInvoice(INVOICE_ID, { store, nmi, ...clock })

      expect(result.outcome).toBe('blocked')
      expect(saleCalls).toHaveLength(0)
      expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('failed')
      expect(rows.get(INVOICE_ID)!.failureReason).toContain('merchant account')
      expect(notifications).toHaveLength(0)
    }
  })

  test('an unknown invoice id is reported, not thrown', async () => {
    const { store } = fakeStore()
    const { nmi } = fakeGateway()
    expect(await chargeInvoice(OTHER_INVOICE_ID, { store, nmi, ...clock })).toEqual({
      outcome: 'not_found',
      invoiceId: OTHER_INVOICE_ID,
    })
  })
})

test.describe('refund math', () => {
  test('no requested amount refunds everything that remains', () => {
    expect(resolveRefundAmount(165_000, 0)).toEqual({ ok: true, amountCents: 165_000, full: true })
    expect(resolveRefundAmount(165_000, 100_000, null)).toEqual({ ok: true, amountCents: 65_000, full: true })
  })

  test('a partial amount must be a positive whole number of cents within what remains', () => {
    expect(resolveRefundAmount(165_000, 0, 50_000)).toEqual({ ok: true, amountCents: 50_000, full: false })
    expect(resolveRefundAmount(165_000, 100_000, 65_000)).toEqual({ ok: true, amountCents: 65_000, full: true })
    expect(resolveRefundAmount(165_000, 100_000, 65_001).ok).toBe(false)
    expect(resolveRefundAmount(165_000, 0, 0).ok).toBe(false)
    expect(resolveRefundAmount(165_000, 0, -5).ok).toBe(false)
    expect(resolveRefundAmount(165_000, 0, 12.5).ok).toBe(false)
  })

  test('a fully refunded invoice cannot be refunded again', () => {
    expect(resolveRefundAmount(165_000, 165_000)).toEqual({ ok: false, reason: 'Invoice is already fully refunded' })
  })

  test('status follows the running total and is clamped at the invoice total', () => {
    expect(refundStatusAfter(165_000, 0, 50_000)).toEqual({ refundedCents: 50_000, status: 'partially_refunded' })
    expect(refundStatusAfter(165_000, 100_000, 65_000)).toEqual({ refundedCents: 165_000, status: 'refunded' })
    expect(refundStatusAfter(165_000, 100_000, 999_999)).toEqual({ refundedCents: 165_000, status: 'refunded' })
  })
})

test.describe('refundInvoice', () => {
  const paid = () => invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1', attempts: 1 })

  test('a partial refund moves the invoice to partially_refunded and records the refund event', async () => {
    const { store, rows, events, notifications } = fakeStore({ invoices: [paid()] })
    const { nmi, refundCalls } = fakeGateway([], [approved('rf-1', 'refund')])

    const result = await refundInvoice(INVOICE_ID, { amountCents: 50_000, requestedBy: 'admin-1' }, { store, nmi, ...clock })

    expect(result).toEqual({
      outcome: 'refunded',
      invoiceId: INVOICE_ID,
      transactionId: 'rf-1',
      amountCents: 50_000,
      refundedCents: 50_000,
      status: 'partially_refunded',
    })
    expect(refundCalls).toEqual([{ transactionId: 'tx-1', amountCents: 50_000 }])
    const row = rows.get(INVOICE_ID)!
    expect(row.paymentStatus).toBe('partially_refunded')
    expect(row.refundedCents).toBe(50_000)
    expect(row.isPaid).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0].provider_event_id).toBe('nmi-refund:rf-1')
    expect(events[0].event_type).toBe('transaction.refund.approved')
    expect(events[0].payload).toMatchObject({ invoice_id: INVOICE_ID, amount_cents: 50_000, requested_by: 'admin-1' })
    expect(notifications[0]).toMatchObject({ userId: 'buyer-1', title: 'Refund issued', type: 'payment_refunded' })
  })

  test('a full refund of an untouched sale omits the amount and ends at refunded', async () => {
    const { store, rows } = fakeStore({ invoices: [paid()] })
    const { nmi, refundCalls } = fakeGateway([], [approved('rf-full', 'refund')])

    const result = await refundInvoice(INVOICE_ID, {}, { store, nmi, ...clock })

    expect(result).toMatchObject({ outcome: 'refunded', amountCents: 165_000, refundedCents: 165_000, status: 'refunded' })
    expect(refundCalls).toEqual([{ transactionId: 'tx-1', amountCents: undefined }])
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('refunded')
    expect(rows.get(INVOICE_ID)!.isPaid).toBe(false)
  })

  test('refunding the remainder after a partial refund sends the explicit remaining amount', async () => {
    const { store, rows } = fakeStore({
      invoices: [invoice({ paymentStatus: 'partially_refunded', gatewayTransactionId: 'tx-1', refundedCents: 100_000 })],
    })
    const { nmi, refundCalls } = fakeGateway([], [approved('rf-2', 'refund')])

    const result = await refundInvoice(INVOICE_ID, {}, { store, nmi, ...clock })

    expect(result).toMatchObject({ outcome: 'refunded', amountCents: 65_000, refundedCents: 165_000, status: 'refunded' })
    expect(refundCalls).toEqual([{ transactionId: 'tx-1', amountCents: 65_000 }])
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('refunded')
  })

  test('a declined refund changes nothing', async () => {
    const { store, rows, events } = fakeStore({ invoices: [paid()] })
    const { nmi } = fakeGateway([], [declined('Transaction already settled REFID:1')])

    const result = await refundInvoice(INVOICE_ID, { amountCents: 1_000 }, { store, nmi, ...clock })

    expect(result).toEqual({ outcome: 'declined', invoiceId: INVOICE_ID, reason: 'Transaction already settled' })
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('paid')
    expect(rows.get(INVOICE_ID)!.refundedCents).toBe(0)
    expect(events).toHaveLength(0)
  })

  test('only paid invoices can be refunded, and never for more than remains', async () => {
    const unpaid = fakeStore()
    const gw = fakeGateway()
    expect(await refundInvoice(INVOICE_ID, {}, { store: unpaid.store, nmi: gw.nmi, ...clock })).toMatchObject({
      outcome: 'not_refundable',
      status: 'unpaid',
    })

    const over = fakeStore({ invoices: [paid()] })
    expect(await refundInvoice(INVOICE_ID, { amountCents: 165_001 }, { store: over.store, nmi: gw.nmi, ...clock })).toMatchObject({
      outcome: 'invalid_amount',
    })
    expect(gw.refundCalls).toHaveLength(0)
  })
})

test.describe('selectRetryableInvoices', () => {
  const t = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString()

  test('retries a failed invoice only after the bidder saved a verified card, and gives up after the cap', () => {
    const invoices = [
      { id: 'a', buyer_id: 'u1', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-60), created_at: t(-120) },
      { id: 'b', buyer_id: 'u2', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-60), created_at: t(-120) },
      { id: 'c', buyer_id: 'u3', payment_status: 'failed' as const, attempts: MAX_CHARGE_ATTEMPTS, last_attempt_at: t(-60), created_at: t(-120) },
      { id: 'd', buyer_id: 'u4', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-60), created_at: t(-120) },
      { id: 'e', buyer_id: 'u5', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-60), created_at: t(-120) },
    ]
    const cards = [
      { user_id: 'u1', updated_at: t(-30), verified_at: t(-30) }, // updated after the attempt
      { user_id: 'u2', updated_at: t(-90), verified_at: t(-90) }, // updated before the attempt
      { user_id: 'u3', updated_at: t(-30), verified_at: t(-30) }, // out of attempts
      { user_id: 'u4', updated_at: t(-30), verified_at: null }, // new card but it failed verification
      // u5 has no card at all
    ]
    expect(selectRetryableInvoices(invoices, cards, NOW)).toEqual(['a'])
  })

  test('picks up never-attempted unpaid invoices after the grace period, and nothing else', () => {
    const graceMinutes = UNATTEMPTED_GRACE_MS / 60_000
    const invoices = [
      { id: 'old', buyer_id: 'u1', payment_status: 'unpaid' as const, attempts: 0, last_attempt_at: null, created_at: t(-graceMinutes - 1) },
      { id: 'fresh', buyer_id: 'u1', payment_status: 'unpaid' as const, attempts: 0, last_attempt_at: null, created_at: t(-1) },
      { id: 'paid', buyer_id: 'u1', payment_status: 'paid' as const, attempts: 1, last_attempt_at: t(-5), created_at: t(-60) },
      { id: 'processing', buyer_id: 'u1', payment_status: 'processing' as const, attempts: 0, last_attempt_at: t(-5), created_at: t(-60) },
    ]
    expect(selectRetryableInvoices(invoices, [], NOW)).toEqual(['old'])
  })
})

test.describe('toChargeableInvoice', () => {
  test('flattens the PostgREST join and normalises numeric strings and nulls', () => {
    const mapped = toChargeableInvoice({
      id: INVOICE_ID,
      lot_id: 'lot-1',
      buyer_id: 'buyer-1',
      hammer_price: 150_000,
      buyer_premium_percent: '12.50',
      total_amount: 168_750,
      payment_status: 'unpaid',
      gateway_transaction_id: null,
      attempts: null,
      refunded_cents: null,
      lot: {
        lot_number: 3,
        title: 'Clock',
        auction: { id: 'auc-1', title: 'Sale', auctioneer: { id: 'auct-1', user_id: 'u', gateway_processor_id: null, payments_enabled: null } },
      },
    })
    expect(mapped.buyerPremiumPercent).toBe(12.5)
    expect(mapped.attempts).toBe(0)
    expect(mapped.refundedCents).toBe(0)
    expect(mapped.auctioneer).toEqual({ id: 'auct-1', userId: 'u', gatewayProcessorId: null, paymentsEnabled: false })
  })
})

// ---------------------------------------------------------------------------
// Webhook handlers
// ---------------------------------------------------------------------------

function webhook(eventType: string, body: Partial<NmiWebhookEvent['event_body']> = {}, id = 'evt_1'): NmiWebhookEvent {
  return {
    event_id: id,
    event_type: eventType,
    event_body: { order_id: INVOICE_ID, transaction_id: 'tx-1', action: { amount: '1650.00' }, ...body },
  }
}

test.describe('invoice webhook handlers', () => {
  test('registers the sale, refund, void, chargeback and dispute types', () => {
    expect([...INVOICE_WEBHOOK_EVENT_TYPES].sort()).toEqual(
      ['chargeback', 'dispute', 'transaction.refund.success', 'transaction.sale.failure', 'transaction.sale.success', 'transaction.void.success'].sort()
    )
  })

  test('amountToCents parses gateway amounts and rejects junk', () => {
    expect(amountToCents('1650.00')).toBe(165_000)
    expect(amountToCents('12.34')).toBe(1_234)
    expect(amountToCents(12.34)).toBe(1_234)
    expect(amountToCents('$1,650.00')).toBe(165_000)
    expect(amountToCents('abc')).toBeNull()
    expect(amountToCents(undefined)).toBeNull()
    expect(amountToCents('')).toBeNull()
  })

  test('events whose order_id is not an invoice id are ignored', async () => {
    const { store } = fakeStore()
    const result = await handleInvoiceWebhookEvent(webhook('transaction.sale.success', { order_id: 'stmt-2026-09' }), { store })
    expect(result).toEqual({ action: 'ignored', reason: 'order_id is not an invoice id' })
    const missing = await handleInvoiceWebhookEvent(webhook('transaction.sale.success', { order_id: OTHER_INVOICE_ID }), { store })
    expect(missing).toMatchObject({ action: 'ignored', reason: 'invoice not found' })
  })

  test('sale.success reconciles a processing invoice to paid once; a redelivery is a no-op', async () => {
    const { store, rows, events, notifications } = fakeStore({ invoices: [invoice({ paymentStatus: 'processing' })] })

    const first = await handleInvoiceWebhookEvent(webhook('transaction.sale.success'), { store, ...clock })
    expect(first).toEqual({ action: 'paid', invoiceId: INVOICE_ID })
    const row = rows.get(INVOICE_ID)!
    expect(row.paymentStatus).toBe('paid')
    expect(row.isPaid).toBe(true)
    expect(row.gatewayTransactionId).toBe('tx-1')
    expect(row.paidAt).toBe(NOW.toISOString())
    expect(events.map((e) => e.provider_event_id)).toEqual(['nmi-sale:tx-1'])
    expect(notifications).toHaveLength(1)

    const again = await handleInvoiceWebhookEvent(webhook('transaction.sale.success'), { store, ...clock })
    expect(again).toEqual({ action: 'noop', invoiceId: INVOICE_ID })
    expect(events).toHaveLength(1)
    expect(notifications).toHaveLength(1)
  })

  test('sale.success with an amount that does not match the invoice is refused', async () => {
    const { store, rows } = fakeStore({ invoices: [invoice({ paymentStatus: 'processing' })] })
    const result = await handleInvoiceWebhookEvent(
      webhook('transaction.sale.success', { action: { amount: '10.00' } }),
      { store, ...clock }
    )
    expect(result).toMatchObject({ action: 'ignored', reason: 'amount mismatch' })
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('processing')
  })

  test('sale.failure records the gateway reason on a processing invoice and leaves a paid one alone', async () => {
    const processing = fakeStore({ invoices: [invoice({ paymentStatus: 'processing' })] })
    const failed = await handleInvoiceWebhookEvent(
      webhook('transaction.sale.failure', { action: { amount: '1650.00', response_text: 'Insufficient funds' } }),
      { store: processing.store, ...clock }
    )
    expect(failed).toEqual({ action: 'failed', invoiceId: INVOICE_ID })
    expect(processing.rows.get(INVOICE_ID)!.paymentStatus).toBe('failed')
    expect(processing.rows.get(INVOICE_ID)!.failureReason).toBe('Insufficient funds')

    const paid = fakeStore({ invoices: [invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1' })] })
    const noop = await handleInvoiceWebhookEvent(webhook('transaction.sale.failure'), { store: paid.store, ...clock })
    expect(noop).toEqual({ action: 'noop', invoiceId: INVOICE_ID })
    expect(paid.rows.get(INVOICE_ID)!.paymentStatus).toBe('paid')
  })

  test('refund.success applies each refund transaction once and tracks the running total', async () => {
    const { store, rows, events, notifications } = fakeStore({
      invoices: [invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1' })],
    })

    const partial = webhook('transaction.refund.success', { transaction_id: 'rf-1', action: { amount: '500.00' } })
    expect(await handleInvoiceWebhookEvent(partial, { store, ...clock })).toEqual({ action: 'partially_refunded', invoiceId: INVOICE_ID })
    expect(rows.get(INVOICE_ID)!.refundedCents).toBe(50_000)
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('partially_refunded')

    // Same refund delivered again (claim takeover or NMI retry): nothing changes.
    expect(await handleInvoiceWebhookEvent(partial, { store, ...clock })).toEqual({ action: 'noop', invoiceId: INVOICE_ID })
    expect(rows.get(INVOICE_ID)!.refundedCents).toBe(50_000)

    const rest = webhook('transaction.refund.success', { transaction_id: 'rf-2', action: { amount: '1150.00' } }, 'evt_2')
    expect(await handleInvoiceWebhookEvent(rest, { store, ...clock })).toEqual({ action: 'refunded', invoiceId: INVOICE_ID })
    expect(rows.get(INVOICE_ID)!.refundedCents).toBe(165_000)
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('refunded')
    expect(rows.get(INVOICE_ID)!.isPaid).toBe(false)

    expect(events.map((e) => e.provider_event_id)).toEqual(['nmi-refund:rf-1', 'nmi-refund:rf-2'])
    expect(notifications.filter((n) => n.type === 'payment_refunded')).toHaveLength(2)
  })

  test('a refund we initiated ourselves is not applied twice when its webhook arrives', async () => {
    const { store, rows, events } = fakeStore({ invoices: [invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1' })] })
    const { nmi } = fakeGateway([], [approved('rf-1', 'refund')])

    await refundInvoice(INVOICE_ID, { amountCents: 50_000 }, { store, nmi, ...clock })
    const result = await handleInvoiceWebhookEvent(
      webhook('transaction.refund.success', { transaction_id: 'rf-1', action: { amount: '500.00' } }),
      { store, ...clock }
    )

    expect(result).toEqual({ action: 'noop', invoiceId: INVOICE_ID })
    expect(rows.get(INVOICE_ID)!.refundedCents).toBe(50_000)
    expect(events).toHaveLength(1)
  })

  test('void.success on the sale marks the invoice refunded in full', async () => {
    const { store, rows, events } = fakeStore({ invoices: [invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1' })] })

    const result = await handleInvoiceWebhookEvent(webhook('transaction.void.success'), { store, ...clock })

    expect(result).toEqual({ action: 'voided', invoiceId: INVOICE_ID })
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('refunded')
    expect(rows.get(INVOICE_ID)!.refundedCents).toBe(165_000)
    expect(rows.get(INVOICE_ID)!.isPaid).toBe(false)
    expect(events.map((e) => e.provider_event_id)).toEqual(['nmi-void:tx-1'])

    expect(await handleInvoiceWebhookEvent(webhook('transaction.void.success'), { store, ...clock })).toEqual({
      action: 'noop',
      invoiceId: INVOICE_ID,
    })
  })

  test('void.success for some other transaction is ignored', async () => {
    const { store, rows } = fakeStore({ invoices: [invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1' })] })
    const result = await handleInvoiceWebhookEvent(webhook('transaction.void.success', { transaction_id: 'tx-other' }), { store, ...clock })
    expect(result).toMatchObject({ action: 'ignored', reason: 'transaction mismatch' })
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('paid')
  })

  test('a chargeback marks the invoice disputed and notifies every admin exactly once', async () => {
    const { store, rows, notifications } = fakeStore({
      invoices: [invoice({ paymentStatus: 'paid', gatewayTransactionId: 'tx-1' })],
      admins: ['admin-1', 'admin-2'],
    })

    const opened = await handleInvoiceWebhookEvent(webhook('chargeback.opened'), { store, ...clock })
    expect(opened).toEqual({ action: 'disputed', invoiceId: INVOICE_ID })
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('disputed')
    expect(rows.get(INVOICE_ID)!.isPaid).toBe(true)
    const adminNotes = notifications.filter((n) => n.type === 'payment_dispute')
    expect(adminNotes.map((n) => n.userId).sort()).toEqual(['admin-1', 'admin-2'])
    expect(adminNotes[0].title).toBe('Chargeback opened')
    expect(adminNotes[0].message).toContain(INVOICE_ID)

    const again = await handleInvoiceWebhookEvent(webhook('dispute.updated', {}, 'evt_2'), { store, ...clock })
    expect(again).toEqual({ action: 'noop', invoiceId: INVOICE_ID })
    expect(notifications.filter((n) => n.type === 'payment_dispute')).toHaveLength(2)
  })

  test('a dispute on an invoice that was never paid is ignored', async () => {
    const { store, rows, notifications } = fakeStore({ admins: ['admin-1'] })
    const result = await handleInvoiceWebhookEvent(webhook('chargeback.opened'), { store, ...clock })
    expect(result).toMatchObject({ action: 'ignored' })
    expect(rows.get(INVOICE_ID)!.paymentStatus).toBe('unpaid')
    expect(notifications).toHaveLength(0)
  })
})

test.describe('the one-retry dunning policy', () => {
  const t = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString()
  const delayMinutes = RETRY_DELAY_MS / 60_000

  test('retries once the wait has passed, even though the bidder changed nothing', () => {
    const rested = { id: 'rested', buyer_id: 'u1', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-delayMinutes), created_at: t(-delayMinutes - 60) }
    const fresh = { id: 'fresh', buyer_id: 'u2', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-delayMinutes + 1), created_at: t(-delayMinutes - 60) }
    const cards = [
      { user_id: 'u1', updated_at: t(-delayMinutes - 60), verified_at: t(-delayMinutes - 60) },
      { user_id: 'u2', updated_at: t(-delayMinutes - 60), verified_at: t(-delayMinutes - 60) },
    ]
    // Same card, same decline: only the one that has rested long enough goes again.
    expect(selectRetryableInvoices([rested, fresh], cards, NOW)).toEqual(['rested'])
  })

  test('stops after the retry: the cap is one charge plus one retry', () => {
    expect(MAX_CHARGE_ATTEMPTS).toBe(2)
    const exhausted = { id: 'done', buyer_id: 'u1', payment_status: 'failed' as const, attempts: MAX_CHARGE_ATTEMPTS, last_attempt_at: t(-delayMinutes * 10), created_at: t(-delayMinutes * 20) }
    const cards = [{ user_id: 'u1', updated_at: t(-1), verified_at: t(-1) }]
    // Not even a brand new card restarts it; the invoice belongs to the auction house now.
    expect(selectRetryableInvoices([exhausted], cards, NOW)).toEqual([])
    expect(selectExhaustedInvoices([exhausted])).toEqual(['done'])
  })

  test('an invoice still inside the cap is not handed over', () => {
    const midway = { id: 'midway', buyer_id: 'u1', payment_status: 'failed' as const, attempts: 1, last_attempt_at: t(-60), created_at: t(-120) }
    const unpaid = { id: 'unpaid', buyer_id: 'u2', payment_status: 'unpaid' as const, attempts: 0, last_attempt_at: null, created_at: t(-120) }
    expect(selectExhaustedInvoices([midway, unpaid])).toEqual([])
  })

  test('hands the invoice to the auction house once, telling both sides what happens at pickup', async () => {
    const { store, notifications, events } = fakeStore({
      invoices: [invoice({ paymentStatus: 'failed', attempts: MAX_CHARGE_ATTEMPTS })],
    })

    expect(await notifyUnpaidInvoice(INVOICE_ID, { store, ...clock })).toEqual({
      outcome: 'notified',
      invoiceId: INVOICE_ID,
    })

    const auctioneerNotice = notifications.find((n) => n.userId === 'auct-user')!
    expect(auctioneerNotice.type).toBe('invoice_unpaid')
    expect(auctioneerNotice.message).toContain('$1,650.00')
    expect(auctioneerNotice.message).toContain('pickup')
    const buyerNotice = notifications.find((n) => n.userId === 'buyer-1')!
    expect(buyerNotice.message).toContain('delivery is not available')
    expect(events).toHaveLength(1)

    // The hourly cron runs again: the auction house is not told twice.
    expect(await notifyUnpaidInvoice(INVOICE_ID, { store, ...clock })).toEqual({
      outcome: 'already_notified',
      invoiceId: INVOICE_ID,
    })
    expect(notifications.filter((n) => n.type === 'invoice_unpaid')).toHaveLength(2)
  })

  test('an invoice that still has an attempt left is never handed over', async () => {
    const { store, notifications } = fakeStore({
      invoices: [invoice({ paymentStatus: 'failed', attempts: 1 })],
    })
    expect(await notifyUnpaidInvoice(INVOICE_ID, { store, ...clock })).toMatchObject({
      outcome: 'not_exhausted',
      attempts: 1,
    })
    expect(notifications).toHaveLength(0)
  })
})
