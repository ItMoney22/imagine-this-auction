import { createHmac } from 'crypto'

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { NmiDispatchResult } from '../../lib/payments/nmi-handlers'
import type { NmiWebhookEvent } from '../../lib/payments/nmi-types'
import {
  createSupabaseNmiEventStore,
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
    // rows; a non-matching row updates nothing and reports false.
    async markProcessed(eventId, at, claimedAt) {
      const row = rows.get(eventId)
      if (!row || row.processed || row.processing_started_at !== claimedAt.toISOString()) return false
      row.processed = true
      row.processed_at = at.toISOString()
      row.processing_started_at = null
      return true
    },
    async releaseClaim(eventId, claimedAt) {
      const row = rows.get(eventId)
      if (!row || row.processed || row.processing_started_at !== claimedAt.toISOString()) return false
      row.processing_started_at = null
      return true
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

  test('when the claim is lost and the processed flag cannot be read, the answer is 500 (retryable), not a false duplicate', async () => {
    const { store, rows } = memoryStore()
    const { dispatch, seen } = dispatcher()
    const event = saleEvent()
    // Another delivery holds a live claim, so this request will not win the claim.
    await store.insertIfNew(event)
    await store.claim(event.event_id, new Date(NOW.getTime() - 5_000), new Date(0))
    const flaky: NmiEventStore = {
      ...store,
      async isProcessed() {
        throw new Error('read timeout')
      },
    }

    const outcome = await processNmiWebhook(signedRequest(event), { store: flaky, dispatch, ...clock })

    expect(outcome.status).toBe(500)
    expect(outcome.body).toEqual({ error: 'Unable to read event' })
    expect(seen).toHaveLength(0)
    // The other delivery's claim is untouched.
    expect(rows.get('evt_1')?.processing_started_at).toBe(new Date(NOW.getTime() - 5_000).toISOString())
    expect(rows.get('evt_1')?.processed).toBe(false)
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

/**
 * The Supabase-backed store, against a recording fake client. These assert the
 * exact PostgREST chain each method builds, because the claim semantics live in
 * those filters: `processed = false`, the `.or(...)` stale-or-null clause, and
 * the `processing_started_at = claimedAt` ownership guard on every later write.
 */
type ChainCall = [method: string, args: unknown[]]
type QueryResult = { data?: unknown; error?: { message: string } | null }

function recordingClient(results: QueryResult[] = []) {
  const calls: Array<{ table: string; chain: ChainCall[] }> = []
  let cursor = 0
  const client = {
    from(table: string) {
      const entry = { table, chain: [] as ChainCall[] }
      calls.push(entry)
      const builder: Record<string, unknown> = {
        then(resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) {
          const result = results[cursor++] ?? { data: null, error: null }
          return Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject)
        },
      }
      for (const method of ['upsert', 'update', 'select', 'eq', 'or', 'maybeSingle']) {
        builder[method] = (...args: unknown[]) => {
          entry.chain.push([method, args])
          return builder
        }
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const CLAIMED_AT = new Date('2026-09-05T12:00:00.000Z')
const STALE_BEFORE = new Date(CLAIMED_AT.getTime() - NMI_CLAIM_STALE_MS)

test.describe('createSupabaseNmiEventStore', () => {
  test('insertIfNew upserts on provider_event_id and ignores duplicates so a redelivery never resets a row', async () => {
    const { client, calls } = recordingClient()
    const store = createSupabaseNmiEventStore(() => client)

    await store.insertIfNew(saleEvent())

    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('payment_events')
    expect(calls[0].chain).toHaveLength(1)
    const [method, args] = calls[0].chain[0]
    expect(method).toBe('upsert')
    expect(args[0]).toMatchObject({
      provider: 'nmi',
      provider_event_id: 'evt_1',
      event_type: 'transaction.sale.success',
      payload: saleEvent(),
      processed: false,
    })
    expect(typeof (args[0] as { id: string }).id).toBe('string')
    expect(args[1]).toEqual({ onConflict: 'provider_event_id', ignoreDuplicates: true })
  })

  test('claim is one conditional UPDATE on unprocessed rows that are unclaimed or stale, and reports whether a row matched', async () => {
    const won = recordingClient([{ data: [{ id: 'row-1' }] }])
    const store = createSupabaseNmiEventStore(() => won.client)

    expect(await store.claim('evt_1', CLAIMED_AT, STALE_BEFORE)).toBe(true)
    expect(won.calls[0].table).toBe('payment_events')
    expect(won.calls[0].chain).toEqual([
      ['update', [{ processing_started_at: CLAIMED_AT.toISOString() }]],
      ['eq', ['provider_event_id', 'evt_1']],
      ['eq', ['processed', false]],
      ['or', [`processing_started_at.is.null,processing_started_at.lt.${STALE_BEFORE.toISOString()}`]],
      ['select', ['id']],
    ])

    const lost = recordingClient([{ data: [] }])
    expect(await createSupabaseNmiEventStore(() => lost.client).claim('evt_1', CLAIMED_AT, STALE_BEFORE)).toBe(false)
  })

  test('markProcessed is scoped to the owning claim and returns false when the row is no longer owned', async () => {
    const at = new Date(CLAIMED_AT.getTime() + 1_500)
    const owned = recordingClient([{ data: [{ id: 'row-1' }] }])
    const store = createSupabaseNmiEventStore(() => owned.client)

    expect(await store.markProcessed('evt_1', at, CLAIMED_AT)).toBe(true)
    expect(owned.calls[0].chain).toEqual([
      ['update', [{ processed: true, processed_at: at.toISOString(), processing_started_at: null }]],
      ['eq', ['provider_event_id', 'evt_1']],
      ['eq', ['processed', false]],
      ['eq', ['processing_started_at', CLAIMED_AT.toISOString()]],
      ['select', ['id']],
    ])

    const takenOver = recordingClient([{ data: [] }])
    expect(await createSupabaseNmiEventStore(() => takenOver.client).markProcessed('evt_1', at, CLAIMED_AT)).toBe(false)
  })

  test('releaseClaim clears only a claim it still owns and returns false otherwise', async () => {
    const owned = recordingClient([{ data: [{ id: 'row-1' }] }])
    const store = createSupabaseNmiEventStore(() => owned.client)

    expect(await store.releaseClaim('evt_1', CLAIMED_AT)).toBe(true)
    expect(owned.calls[0].chain).toEqual([
      ['update', [{ processing_started_at: null }]],
      ['eq', ['provider_event_id', 'evt_1']],
      ['eq', ['processed', false]],
      ['eq', ['processing_started_at', CLAIMED_AT.toISOString()]],
      ['select', ['id']],
    ])

    const takenOver = recordingClient([{ data: [] }])
    expect(await createSupabaseNmiEventStore(() => takenOver.client).releaseClaim('evt_1', CLAIMED_AT)).toBe(false)
  })

  test('isProcessed reads the flag by provider_event_id', async () => {
    const yes = recordingClient([{ data: { processed: true } }])
    expect(await createSupabaseNmiEventStore(() => yes.client).isProcessed('evt_1')).toBe(true)
    expect(yes.calls[0].chain).toEqual([
      ['select', ['processed']],
      ['eq', ['provider_event_id', 'evt_1']],
      ['maybeSingle', []],
    ])

    const no = recordingClient([{ data: { processed: false } }])
    expect(await createSupabaseNmiEventStore(() => no.client).isProcessed('evt_1')).toBe(false)
    const missing = recordingClient([{ data: null }])
    expect(await createSupabaseNmiEventStore(() => missing.client).isProcessed('evt_1')).toBe(false)
  })

  test('a PostgREST error on any step surfaces as a thrown Error naming the step', async () => {
    const failing = recordingClient([{ error: { message: 'column processing_started_at does not exist' } }])
    const store = createSupabaseNmiEventStore(() => failing.client)

    await expect(store.claim('evt_1', CLAIMED_AT, STALE_BEFORE)).rejects.toThrow(
      'payment_events claim failed: column processing_started_at does not exist'
    )
  })

  test('the client factory is called lazily, once', async () => {
    let created = 0
    const { client } = recordingClient([{ data: [] }, { data: [] }])
    const store = createSupabaseNmiEventStore(() => {
      created += 1
      return client
    })
    expect(created).toBe(0)
    await store.releaseClaim('evt_1', CLAIMED_AT)
    await store.releaseClaim('evt_1', CLAIMED_AT)
    expect(created).toBe(1)
  })
})
