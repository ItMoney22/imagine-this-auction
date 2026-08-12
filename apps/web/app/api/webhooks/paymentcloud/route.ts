import { randomUUID, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentCloudWebhookSchema } from '@/lib/payments/types'
import { PAYMENT_PROVIDER, getCreditPack } from '@/lib/payments/config'

const WEBHOOK_SECRET = process.env.PAYMENTCLOUD_WEBHOOK_SECRET

// Shared-secret header check with a constant-time comparison.
// TODO(paymentcloud-onboarding): once merchant credentials exist, replace with
// PaymentCloud's real HMAC-over-body verification per their webhook docs.
function isValidSignature(signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false
  const expected = Buffer.from(WEBHOOK_SECRET)
  const received = Buffer.from(signature)
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

export async function POST(request: NextRequest) {
  try {
    if (PAYMENT_PROVIDER !== 'paymentcloud') {
      console.warn('Received PaymentCloud webhook while provider is set to', PAYMENT_PROVIDER)
    }

    const signature = request.headers.get('x-paymentcloud-signature')
    if (!isValidSignature(signature)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const json = await request.json()
    const parseResult = PaymentCloudWebhookSchema.safeParse(json)

    if (!parseResult.success) {
      console.error('Failed to parse PaymentCloud webhook payload', parseResult.error)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const event = parseResult.data
    const payload = event.payload

    // Never trust the webhook's amounts blindly — they must match the pack
    const pack = getCreditPack(payload.packId)
    if (!pack || payload.creditAmount !== pack.amount || payload.amountUsdCents !== pack.price) {
      console.error('PaymentCloud webhook amount mismatch', {
        packId: payload.packId,
        creditAmount: payload.creditAmount,
        amountUsdCents: payload.amountUsdCents,
      })
      return NextResponse.json({ error: 'Payload does not match credit pack' }, { status: 400 })
    }

    // payment_events is admin-only under RLS — webhook writes need the
    // service-role client. Untyped: hand-written Database types drift from
    // the live schema (see database.ts note in launch sweep).
    const supabase: SupabaseClient = createAdminClient()

    // Ensure idempotency
    const { data: existingEvent, error: fetchError } = await supabase
      .from('payment_events')
      .select('id, processed')
      .eq('provider_event_id', event.eventId)
      .maybeSingle()

    if (fetchError) {
      console.error('Failed to fetch payment event', fetchError)
      return NextResponse.json({ error: 'Unable to persist event' }, { status: 500 })
    }

    if (existingEvent?.processed) {
      return NextResponse.json({ ok: true, processed: false })
    }

    const record = {
      id: existingEvent?.id ?? randomUUID(),
      provider: 'paymentcloud',
      provider_event_id: event.eventId,
      event_type: event.type,
      payload: payload,
      processed: false,
      created_at: event.occurredAt ?? new Date().toISOString(),
      processed_at: null,
    }

    const upsertResult = await supabase
      .from('payment_events')
      .upsert(record, { onConflict: 'provider_event_id' })

    if (upsertResult.error) {
      console.error('Failed to upsert payment event', upsertResult.error)
      return NextResponse.json({ error: 'Unable to store event' }, { status: 500 })
    }

    if (event.type === 'sale.approved') {
      const description = payload.description || 'ITC Credit Purchase'
      const { data: creditResult, error: creditError } = await supabase.rpc('add_wallet_credits', {
        user_uuid: payload.userId,
        credit_amount: payload.creditAmount,
        provider_event_identifier: event.eventId,
        purchase_description: description,
      })

      if (creditError || creditResult === false) {
        console.error('Failed to mint credits from PaymentCloud webhook', creditError)
        return NextResponse.json({ error: 'Failed to mint credits' }, { status: 500 })
      }

      await supabase
        .from('payment_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('provider_event_id', event.eventId)
    }

    return NextResponse.json({ ok: true, processed: event.type === 'sale.approved' })
  } catch (error) {
    console.error('PaymentCloud webhook processing failed', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
