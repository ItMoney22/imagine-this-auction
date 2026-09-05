import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { describeSignatureNonce, verifyNmiSignature } from './nmi'
import { dispatchNmiEvent, type NmiDispatchResult } from './nmi-handlers'
import { NmiWebhookEventSchema, type NmiWebhookEvent } from './nmi-types'

/**
 * NMI webhook intake, separated from the Next.js route so the flow can be
 * unit-tested with an in-memory store.
 *
 * Flow: signature over the raw body -> JSON + schema -> insert the event if
 * new (never resets an existing row) -> atomically claim the row -> dispatch
 * -> mark processed. See docs/PAYMENTS.md, "Storage, claim, and idempotency".
 */

/** A claim older than this is treated as abandoned (crashed worker) and may be taken over. */
export const NMI_CLAIM_STALE_MS = 2 * 60 * 1000

export interface NmiEventStore {
  /** Insert the event when no row has its `provider_event_id`; an existing row is left untouched. */
  insertIfNew(event: NmiWebhookEvent): Promise<void>
  /**
   * Atomically claim the row for processing. Succeeds only when the row is
   * unprocessed and either unclaimed or claimed before `staleBefore`. The
   * `claimedAt` timestamp written here is the ownership token: only the
   * request holding it may later mark the row processed or release it.
   */
  claim(eventId: string, claimedAt: Date, staleBefore: Date): Promise<boolean>
  /**
   * Mark processed only if the row is still claimed by `claimedAt`. Resolves
   * false when no row matched (the claim went stale and a retry took it over).
   */
  markProcessed(eventId: string, at: Date, claimedAt: Date): Promise<boolean>
  /** Clear the claim on an unprocessed row only if it is still owned by `claimedAt`. False when not owned. */
  releaseClaim(eventId: string, claimedAt: Date): Promise<boolean>
  /** Whether the row has already been processed (used to tell a duplicate from an in-flight claim). */
  isProcessed(eventId: string): Promise<boolean>
}

export interface NmiWebhookRequest {
  /** Exact bytes received; the signature is computed over these. */
  rawBody: string
  signatureHeader: string | null
  signingKey: string | undefined
}

export interface NmiWebhookDeps {
  store: NmiEventStore
  dispatch?: (event: NmiWebhookEvent) => Promise<NmiDispatchResult>
  now?: () => Date
}

export interface NmiWebhookOutcome {
  status: 200 | 400 | 401 | 409 | 500
  body: Record<string, unknown>
}

export async function processNmiWebhook(request: NmiWebhookRequest, deps: NmiWebhookDeps): Promise<NmiWebhookOutcome> {
  const dispatch = deps.dispatch ?? dispatchNmiEvent
  const now = deps.now ?? (() => new Date())

  if (!request.signingKey) {
    console.error('[nmi] NMI_WEBHOOK_SIGNING_KEY is not set; refusing unsigned webhook')
    return { status: 500, body: { error: 'Webhook signing key not configured' } }
  }

  const check = verifyNmiSignature(request.signatureHeader, request.rawBody, request.signingKey, {
    nowSeconds: Math.floor(now().getTime() / 1000),
  })
  if (!check.ok) {
    console.warn('[nmi] rejected webhook signature', {
      reason: check.reason,
      nonce: describeSignatureNonce(request.signatureHeader),
      bodyBytes: Buffer.byteLength(request.rawBody),
    })
    return { status: 401, body: { error: 'Invalid webhook signature' } }
  }

  let json: unknown
  try {
    json = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: { error: 'Body is not JSON' } }
  }

  const parsed = NmiWebhookEventSchema.safeParse(json)
  if (!parsed.success) {
    console.error('[nmi] webhook payload failed validation', parsed.error.issues)
    return { status: 400, body: { error: 'Invalid payload' } }
  }
  const event = parsed.data

  // The app clock (not DB now()) stamps both the claim and the stale cutoff so
  // the same value can later prove ownership of the claim.
  const claimedAt = now()
  let claimed: boolean
  try {
    await deps.store.insertIfNew(event)
    claimed = await deps.store.claim(event.event_id, claimedAt, new Date(claimedAt.getTime() - NMI_CLAIM_STALE_MS))
  } catch (error) {
    console.error('[nmi] failed to store or claim webhook event', { eventId: event.event_id, error })
    return { status: 500, body: { error: 'Unable to store event' } }
  }

  if (!claimed) {
    // Either the event was already processed (a true duplicate: acknowledge it
    // so NMI stops retrying) or another delivery holds a live claim (answer
    // retryable so NMI comes back after that delivery finishes or fails).
    let processed: boolean
    try {
      processed = await deps.store.isProcessed(event.event_id)
    } catch (error) {
      console.error('[nmi] could not read event state after a failed claim', { eventId: event.event_id, error })
      return { status: 500, body: { error: 'Unable to read event' } }
    }
    if (processed) {
      return { status: 200, body: { ok: true, duplicate: true } }
    }
    return { status: 409, body: { error: 'Event in progress, retry later' } }
  }

  let result: NmiDispatchResult
  try {
    result = await dispatch(event)
  } catch (error) {
    console.error('[nmi] webhook handler failed', { eventId: event.event_id, eventType: event.event_type, error })
    await releaseQuietly(deps.store, event.event_id, claimedAt)
    return { status: 500, body: { error: 'Webhook handler failed' } }
  }

  try {
    let stillOwned: boolean
    if (result.handled) {
      stillOwned = await deps.store.markProcessed(event.event_id, now(), claimedAt)
    } else {
      // No handler for this type. Keep the row unprocessed so a later pass can
      // dispatch it, but drop the claim so it does not look in-flight.
      stillOwned = await deps.store.releaseClaim(event.event_id, claimedAt)
    }
    if (!stillOwned) {
      // The claim expired mid-handler and a retry took the row over. Nothing
      // to fix here (the retry re-ran the idempotent handler), but it means a
      // handler ran longer than NMI_CLAIM_STALE_MS and deserves a look.
      console.warn('[nmi] claim no longer owned when finishing', { eventId: event.event_id })
    }
  } catch (error) {
    console.error('[nmi] event dispatched but its row could not be updated', {
      eventId: event.event_id,
      handled: result.handled,
      error,
    })
    // Best effort: free the claim so NMI's retry can re-run the (idempotent) handler.
    await releaseQuietly(deps.store, event.event_id, claimedAt)
    return { status: 500, body: { error: 'Unable to update event' } }
  }

  return { status: 200, body: { ok: true, handled: result.handled } }
}

async function releaseQuietly(store: NmiEventStore, eventId: string, claimedAt: Date): Promise<void> {
  try {
    await store.releaseClaim(eventId, claimedAt)
  } catch (error) {
    console.error('[nmi] could not release claim; it expires after NMI_CLAIM_STALE_MS', { eventId, error })
  }
}

/**
 * `payment_events`-backed store. The claim is a single conditional UPDATE, so
 * two concurrent deliveries cannot both win it. Requires migration 019c
 * (`processing_started_at`).
 */
export function createSupabaseNmiEventStore(getClient: () => SupabaseClient): NmiEventStore {
  // payment_events is admin-only under RLS, so this must be the service-role
  // client. Untyped: the hand-written Database types drift from the live
  // schema (see the note in lib/supabase/admin.ts).
  let client: SupabaseClient | undefined
  const db = () => {
    if (!client) client = getClient()
    return client
  }
  const failure = (step: string, error: { message: string }) =>
    new Error(`payment_events ${step} failed: ${error.message}`)

  return {
    async insertIfNew(event) {
      const { error } = await db()
        .from('payment_events')
        .upsert(
          {
            id: randomUUID(),
            provider: 'nmi',
            provider_event_id: event.event_id,
            event_type: event.event_type,
            payload: event,
            processed: false,
          },
          { onConflict: 'provider_event_id', ignoreDuplicates: true }
        )
      if (error) throw failure('insert', error)
    },

    async claim(eventId, claimedAt, staleBefore) {
      // One conditional UPDATE: Postgres row locking + re-check under READ
      // COMMITTED means at most one concurrent request sees a matching row.
      const { data, error } = await db()
        .from('payment_events')
        .update({ processing_started_at: claimedAt.toISOString() })
        .eq('provider_event_id', eventId)
        .eq('processed', false)
        .or(`processing_started_at.is.null,processing_started_at.lt.${staleBefore.toISOString()}`)
        .select('id')
      if (error) throw failure('claim', error)
      return (data?.length ?? 0) > 0
    },

    async markProcessed(eventId, at, claimedAt) {
      // Scoped to the owning claim: a request that outlived the stale window
      // cannot mark a row another request has since taken over. Millisecond
      // ISO strings round-trip exactly through timestamptz.
      const { data, error } = await db()
        .from('payment_events')
        .update({ processed: true, processed_at: at.toISOString(), processing_started_at: null })
        .eq('provider_event_id', eventId)
        .eq('processed', false)
        .eq('processing_started_at', claimedAt.toISOString())
        .select('id')
      if (error) throw failure('mark processed', error)
      return (data?.length ?? 0) > 0
    },

    async releaseClaim(eventId, claimedAt) {
      const { data, error } = await db()
        .from('payment_events')
        .update({ processing_started_at: null })
        .eq('provider_event_id', eventId)
        .eq('processed', false)
        .eq('processing_started_at', claimedAt.toISOString())
        .select('id')
      if (error) throw failure('release claim', error)
      return (data?.length ?? 0) > 0
    },

    async isProcessed(eventId) {
      const { data, error } = await db()
        .from('payment_events')
        .select('processed')
        .eq('provider_event_id', eventId)
        .maybeSingle()
      if (error) throw failure('read', error)
      return data?.processed === true
    },
  }
}
