import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyNmiSignature } from '@/lib/payments/nmi'
import { dispatchNmiEvent } from '@/lib/payments/nmi-handlers'
import { NmiWebhookEventSchema } from '@/lib/payments/nmi-types'

/**
 * POST /api/webhooks/nmi
 *
 * Receives NMI gateway webhooks (transaction, settlement, chargeback events).
 * Flow: verify `Webhook-Signature` over the RAW body -> validate the JSON ->
 * upsert `payment_events` (provider 'nmi', keyed on `event_id`) -> dispatch
 * to the handler registry -> mark processed.
 *
 * Status codes: 200 handled or already processed; 400 bad signature or
 * schema (NMI will not retry); 500 storage or handler failure (NMI retries).
 */
export async function POST(request: NextRequest) {
  // The signature covers the exact bytes NMI sent; read them before any parsing.
  const rawBody = await request.text()

  const signingKey = process.env.NMI_WEBHOOK_SIGNING_KEY
  if (!signingKey) {
    console.error('[nmi] NMI_WEBHOOK_SIGNING_KEY is not set; refusing unsigned webhook')
    return NextResponse.json({ error: 'Webhook signing key not configured' }, { status: 500 })
  }

  const check = verifyNmiSignature(request.headers.get('webhook-signature'), rawBody, signingKey)
  if (!check.ok) {
    console.warn('[nmi] rejected webhook:', check.reason)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 })
  }

  const parsed = NmiWebhookEventSchema.safeParse(json)
  if (!parsed.success) {
    console.error('[nmi] webhook payload failed validation', parsed.error.issues)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const event = parsed.data

  // payment_events is admin-only under RLS, so writes need the service-role
  // client. Untyped: the hand-written Database types drift from the live
  // schema (see the note in lib/supabase/admin.ts).
  const supabase: SupabaseClient = createAdminClient()

  const { data: existing, error: fetchError } = await supabase
    .from('payment_events')
    .select('id, processed')
    .eq('provider_event_id', event.event_id)
    .maybeSingle()

  if (fetchError) {
    console.error('[nmi] failed to look up payment event', fetchError)
    return NextResponse.json({ error: 'Unable to read event store' }, { status: 500 })
  }

  if (existing?.processed) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const { error: upsertError } = await supabase.from('payment_events').upsert(
    {
      id: existing?.id ?? randomUUID(),
      provider: 'nmi',
      provider_event_id: event.event_id,
      event_type: event.event_type,
      payload: event,
      processed: false,
      processed_at: null,
    },
    { onConflict: 'provider_event_id' }
  )

  if (upsertError) {
    console.error('[nmi] failed to store payment event', upsertError)
    return NextResponse.json({ error: 'Unable to store event' }, { status: 500 })
  }

  try {
    const result = await dispatchNmiEvent(event)

    const { error: markError } = await supabase
      .from('payment_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('provider_event_id', event.event_id)

    if (markError) {
      console.error('[nmi] event handled but could not be marked processed', markError)
      return NextResponse.json({ error: 'Unable to mark event processed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, handled: result.handled })
  } catch (error) {
    console.error('[nmi] webhook handler failed', { eventId: event.event_id, eventType: event.event_type, error })
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
