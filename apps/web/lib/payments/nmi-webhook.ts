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
   * unprocessed and either unclaimed or claimed before `staleBefore`.
   */
  claim(eventId: string, now: Date, staleBefore: Date): Promise<boolean>
  markProcessed(eventId: string, at: Date): Promise<void>
  /** Clear the claim on an unprocessed row so a retry can take it. */
  releaseClaim(eventId: string): Promise<void>
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
  status: 200 | 400 | 401 | 500
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

  let claimed: boolean
  try {
    await deps.store.insertIfNew(event)
    const claimedAt = now()
    claimed = await deps.store.claim(event.event_id, claimedAt, new Date(claimedAt.getTime() - NMI_CLAIM_STALE_MS))
  } catch (error) {
    console.error('[nmi] failed to store or claim webhook event', { eventId: event.event_id, error })
    return { status: 500, body: { error: 'Unable to store event' } }
  }

  if (!claimed) {
    // Already processed, or another delivery holds a live claim.
    return { status: 200, body: { ok: true, duplicate: true } }
  }

  let result: NmiDispatchResult
  try {
    result = await dispatch(event)
  } catch (error) {
    console.error('[nmi] webhook handler failed', { eventId: event.event_id, eventType: event.event_type, error })
    await releaseQuietly(deps.store, event.event_id)
    return { status: 500, body: { error: 'Webhook handler failed' } }
  }

  try {
    if (result.handled) {
      await deps.store.markProcessed(event.event_id, now())
    } else {
      // No handler yet (Task 4c). Keep the row unprocessed so a later pass can
      // dispatch it, but drop the claim so it does not look in-flight.
      await deps.store.releaseClaim(event.event_id)
    }
  } catch (error) {
    console.error('[nmi] event dispatched but its row could not be updated', {
      eventId: event.event_id,
      handled: result.handled,
      error,
    })
    return { status: 500, body: { error: 'Unable to update event' } }
  }

  return { status: 200, body: { ok: true, handled: result.handled } }
}

async function releaseQuietly(store: NmiEventStore, eventId: string): Promise<void> {
  try {
    await store.releaseClaim(eventId)
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

    async claim(eventId, now, staleBefore) {
      const { data, error } = await db()
        .from('payment_events')
        .update({ processing_started_at: now.toISOString() })
        .eq('provider_event_id', eventId)
        .eq('processed', false)
        .or(`processing_started_at.is.null,processing_started_at.lt.${staleBefore.toISOString()}`)
        .select('id')
      if (error) throw failure('claim', error)
      return (data?.length ?? 0) > 0
    },

    async markProcessed(eventId, at) {
      const { error } = await db()
        .from('payment_events')
        .update({ processed: true, processed_at: at.toISOString(), processing_started_at: null })
        .eq('provider_event_id', eventId)
      if (error) throw failure('mark processed', error)
    },

    async releaseClaim(eventId) {
      const { error } = await db()
        .from('payment_events')
        .update({ processing_started_at: null })
        .eq('provider_event_id', eventId)
        .eq('processed', false)
      if (error) throw failure('release claim', error)
    },
  }
}
