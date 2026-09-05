import { createHmac } from 'crypto'

import { expect, test } from '@playwright/test'

import type { NmiDispatchResult } from '../../lib/payments/nmi-handlers'
import type { NmiWebhookEvent } from '../../lib/payments/nmi-types'
import {
  NMI_CLAIM_STALE_MS,
  processNmiWebhook,
  type NmiEventStore,
} from '../../lib/payments/nmi-webhook'

/**
 * In-memory `payment_events` with the same claim semantics as the Postgres
 * store: a row is claimable only while unprocessed and either unclaimed or
 * claimed longer ago than `staleBefore`.
 */
function memoryStore() {
  type Row = {
    processed: boolean
    processed_at: string | null
    processing_started_at: string | null
    event_type: string
  }
  const rows = new Map<string, Row>()

  const store: NmiEventStore = {
    async insertIfNew(event) {
      if (!rows.has(event.event_id)) {
        rows.set(event.event_id, {
          processed: false,
          processed_at: null,
          processing_started_at: null,
          event_type: event.event_type,
        })
      }
    },
    async claim(eventId, claimedAt, staleBefore) {
      const row = rows.get(eventId)
      if (!row || row.processed) return false
      if (row.processing_started_at !== null && new Date(row.processing_started_at) >= staleBefore) return false
      row.processing_started_at = claimedAt.toISOString()
      return true
    },
    // Same contract as the Supabase store: both writes are scoped to the
    // owning claim (`processing_started_at = claimedAt`) and to unprocessed
    // rows, and a non-matching row is a silent no-op (PostgREST updates 0 rows).
    async markProcessed(eventId, at, claimedAt) {
      const row = rows.get(eventId)
      if (!row || row.processed || row.processing_started_at !== claimedAt.toISOString()) return
      row.processed = true
      row.processed_at = at.toISOString()
      row.processing_started_at = null
    },
    async releaseClaim(eventId, claimedAt) {
      const row = rows.get(eventId)
      if (!row || row.processed || row.processing_started_at !== claimedAt.toISOString()) return
      row.processing_started_at = null
    },
    async isProcessed(eventId) {
      return rows.get(eventId)?.processed === true
    },
  }

  return { store, rows }
}

const KEY = 'whsec_test'
const NOW = new Date('2026-09-04T12:00:00.000Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)

function signedRequest(payload: unknown, signingKey = KEY) {
  const rawBody = JSON.stringify(payload)
  const t = String(nowSeconds)
  const s = createHmac('sha256', signingKey).update(`${t}.${rawBody}`).digest('hex')
  return { rawBody, signatureHeader: `t=${t},s=${s}`, signingKey: KEY }
}

function saleEvent(id = 'evt_1'): NmiWebhookEvent {
  return {
    event_id: id,
    event_type: 'transaction.sale.success',
    event_body: { transaction_id: '123', condition: 'pendingsettlement', action: { amount: '12.34' } },
  }
}

function dispatcher(result: NmiDispatchResult | Error = { handled: true, handlerKey: 'transaction.sale.success' }) {
  const seen: NmiWebhookEvent[] = []
  const dispatch = async (event: NmiWebhookEvent): Promise<NmiDispatchResult> => {
    seen.push(event)
    if (result instanceof Error) throw result
    return result
  }
  return { dispatch, seen }
}

const clock = { now: () => NOW }

test.describe('processNmiWebhook', () => {
  test('rejects a bad signature with 401 and touches nothing', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const req = signedRequest(saleEvent(), 'wrong-key')

    const outcome = await processNmiWebhook(req, { store, dispatch, ...clock })

    expect(outcome.status).toBe(401)
    expect(rows.size).toBe(0)
    expect(seen).toHaveLength(0)
  })

  test('refuses to run without a signing key', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()

    const outcome = await processNmiWebhook(
      { ...signedRequest(saleEvent()), signingKey: undefined },
      { store, dispatch, ...clock }
    )

    expect(outcome.status).toBe(500)
    expect(rows.size).toBe(0)
    expect(seen).toHaveLength(0)
  })

  test('rejects non-JSON and schema-invalid bodies with 400 after the signature passes', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()

    const t = String(nowSeconds)
    const rawBody = 'not json'
    const s = createHmac('sha256', KEY).update(`${t}.${rawBody}`).digest('hex')
    const notJson = await processNmiWebhook(
      { rawBody, signatureHeader: `t=${t},s=${s}`, signingKey: KEY },
      { store, dispatch, ...clock }
    )
    expect(notJson.status).toBe(400)

    const badShape = await processNmiWebhook(signedRequest({ event_type: 'x', event_body: {} }), {
      store,
      dispatch,
      ...clock,
    })
    expect(badShape.status).toBe(400)

    expect(rows.size).toBe(0)
    expect(seen).toHaveLength(0)
  })

  test('stores, claims, dispatches, and marks a handled event processed', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()

    const outcome = await processNmiWebhook(signedRequest(saleEvent()), { store, dispatch, ...clock })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toEqual({ ok: true, handled: true })
    expect(seen).toHaveLength(1)
    expect(seen[0].event_id).toBe('evt_1')
    const row = rows.get('evt_1')
    expect(row?.processed).toBe(true)
    expect(row?.processed_at).toBe(NOW.toISOString())
    expect(row?.processing_started_at).toBeNull()
  })

  test('a redelivery of a processed event is a 200 duplicate that neither re-dispatches nor resets the row', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const req = signedRequest(saleEvent())

    await processNmiWebhook(req, { store, dispatch, ...clock })
    const later = { now: () => new Date(NOW.getTime() + 60_000) }
    const outcome = await processNmiWebhook(req, { store, dispatch, ...later })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toEqual({ ok: true, duplicate: true })
    expect(seen).toHaveLength(1)
    expect(rows.get('evt_1')?.processed).toBe(true)
    expect(rows.get('evt_1')?.processing_started_at).toBeNull()
  })

  test('a delivery of an event another request claimed seconds ago is answered 409 so NMI retries later', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const event = saleEvent()
    await store.insertIfNew(event)
    await store.claim(event.event_id, new Date(NOW.getTime() - 30_000), new Date(0))

    const outcome = await processNmiWebhook(signedRequest(event), { store, dispatch, ...clock })

    expect(outcome.status).toBe(409)
    expect(outcome.body).toEqual({ error: 'Event in progress, retry later' })
    expect(seen).toHaveLength(0)
    const row = rows.get('evt_1')
    expect(row?.processed).toBe(false)
    // the live claim is untouched
    expect(row?.processing_started_at).toBe(new Date(NOW.getTime() - 30_000).toISOString())
  })

  test('a claim older than the stale window is taken over and dispatched again', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const event = saleEvent()
    await store.insertIfNew(event)
    await store.claim(event.event_id, new Date(NOW.getTime() - NMI_CLAIM_STALE_MS - 1000), new Date(0))

    const outcome = await processNmiWebhook(signedRequest(event), { store, dispatch, ...clock })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toEqual({ ok: true, handled: true })
    expect(seen).toHaveLength(1)
    expect(rows.get('evt_1')?.processed).toBe(true)
  })

  test('an event with no registered handler is stored, acknowledged, and left unprocessed for a later pass', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher({ handled: false })

    const outcome = await processNmiWebhook(signedRequest(saleEvent()), { store, dispatch, ...clock })

    expect(outcome.status).toBe(200)
    expect(outcome.body).toEqual({ ok: true, handled: false })
    expect(seen).toHaveLength(1)
    const row = rows.get('evt_1')
    expect(row?.processed).toBe(false)
    expect(row?.processing_started_at).toBeNull()
  })

  test('a handler failure returns 500 and releases the claim so the retry can take it', async () => {
    const { store, rows } = memoryStore()
    const { dispatch } = dispatcher(new Error('db down'))

    const outcome = await processNmiWebhook(signedRequest(saleEvent()), { store, dispatch, ...clock })

    expect(outcome.status).toBe(500)
    const row = rows.get('evt_1')
    expect(row?.processed).toBe(false)
    expect(row?.processing_started_at).toBeNull()

    // NMI retries: the same delivery now succeeds
    const retry = dispatcher()
    const second = await processNmiWebhook(signedRequest(saleEvent()), { store, dispatch: retry.dispatch, ...clock })
    expect(second.status).toBe(200)
    expect(retry.seen).toHaveLength(1)
    expect(rows.get('evt_1')?.processed).toBe(true)
  })

  test('a store failure before dispatch returns 500 without dispatching', async () => {
    const { store } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const broken: NmiEventStore = {
      ...store,
      async insertIfNew() {
        throw new Error('connection refused')
      },
    }

    const outcome = await processNmiWebhook(signedRequest(saleEvent()), { store: broken, dispatch, ...clock })

    expect(outcome.status).toBe(500)
    expect(seen).toHaveLength(0)
  })

  test('two simultaneous deliveries dispatch exactly once: one 200, one 409', async () => {
    const { store, rows } = memoryStore()
    // A ticking clock gives each request its own claim token.
    let tick = 0
    const ticking = { now: () => new Date(NOW.getTime() + tick++) }
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const seen: NmiWebhookEvent[] = []
    const dispatch = async (event: NmiWebhookEvent): Promise<NmiDispatchResult> => {
      seen.push(event)
      await gate
      return { handled: true, handlerKey: 'transaction.sale.success' }
    }
    const req = signedRequest(saleEvent())

    const pending = Promise.all([
      processNmiWebhook(req, { store, dispatch, ...ticking }),
      processNmiWebhook(req, { store, dispatch, ...ticking }),
    ])
    // Let both requests reach the claim before the handler is allowed to finish.
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()
    const [first, second] = await pending

    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(seen).toHaveLength(1)
    expect(rows.get('evt_1')?.processed).toBe(true)
  })

  test('a request that outlived its claim cannot release or mark the row a later request now owns', async () => {
    const { store, rows } = memoryStore()
    const event = saleEvent()
    const req = signedRequest(event)

    // Request A claims at NOW and its handler hangs.
    let failA!: (error: Error) => void
    const gateA = new Promise<never>((_, reject) => {
      failA = reject
    })
    const dispatchA = async (): Promise<NmiDispatchResult> => gateA
    const a = processNmiWebhook(req, { store, dispatch: dispatchA, now: () => NOW })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(rows.get('evt_1')?.processing_started_at).toBe(NOW.toISOString())

    // Request B arrives after the stale window and takes the claim over; its handler is still running.
    const takeoverAt = new Date(NOW.getTime() + NMI_CLAIM_STALE_MS + 1000)
    let finishB!: () => void
    const gateB = new Promise<void>((resolve) => {
      finishB = resolve
    })
    const dispatchB = async (): Promise<NmiDispatchResult> => {
      await gateB
      return { handled: true, handlerKey: 'transaction.sale.success' }
    }
    const b = processNmiWebhook(req, { store, dispatch: dispatchB, now: () => takeoverAt })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(rows.get('evt_1')?.processing_started_at).toBe(takeoverAt.toISOString())

    // A finally fails. Its release must not touch B's claim.
    failA(new Error('slow handler died'))
    const outcomeA = await a
    expect(outcomeA.status).toBe(500)
    expect(rows.get('evt_1')?.processing_started_at).toBe(takeoverAt.toISOString())
    expect(rows.get('evt_1')?.processed).toBe(false)

    // B completes normally.
    finishB()
    const outcomeB = await b
    expect(outcomeB.status).toBe(200)
    expect(rows.get('evt_1')?.processed).toBe(true)
    expect(rows.get('evt_1')?.processing_started_at).toBeNull()
  })

  test('when the row cannot be marked processed the claim is released so the retry can re-run the handler', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const flaky: NmiEventStore = {
      ...store,
      async markProcessed() {
        throw new Error('write timeout')
      },
    }

    const outcome = await processNmiWebhook(signedRequest(saleEvent()), { store: flaky, dispatch, ...clock })

    expect(outcome.status).toBe(500)
    expect(seen).toHaveLength(1)
    const row = rows.get('evt_1')
    expect(row?.processed).toBe(false)
    expect(row?.processing_started_at).toBeNull()
  })
})
