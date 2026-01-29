import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { PaymentCloudWebhookSchema } from '@/lib/payments/types'
import { PAYMENT_PROVIDER } from '@/lib/payments/config'

const WEBHOOK_SECRET = process.env.PAYMENTCLOUD_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  try {
    if (PAYMENT_PROVIDER !== 'paymentcloud') {
      console.warn('Received PaymentCloud webhook while provider is set to', PAYMENT_PROVIDER)
    }

    const signature = request.headers.get('x-paymentcloud-signature')
    if (WEBHOOK_SECRET && signature !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const json = await request.json()
    const parseResult = PaymentCloudWebhookSchema.safeParse(json)

    if (!parseResult.success) {
      console.error('Failed to parse PaymentCloud webhook payload', parseResult.error)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const event = parseResult.data
    const supabase = await createClient()

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

    const payload = event.payload
    const record = {
      id: existingEvent?.id ?? event.eventId,
      provider: 'paymentcloud',
      provider_event_id: event.eventId,
      event_type: event.type,
      payload: payload,
      processed: false,
      created_at: payload?.createdAt ?? new Date().toISOString(),
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
