import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CardPaymentRequestSchema,
  getCreditPack,
  PAYMENT_PROVIDER,
  PROVIDER_LABEL,
} from '@/lib/payments/config'
import type { CardPaymentResponse } from '@/lib/payments/types'

const PAYMENTCLOUD_API_KEY = process.env.PAYMENTCLOUD_API_KEY

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json<CardPaymentResponse>(
        { success: false, status: 'pending', error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = CardPaymentRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<CardPaymentResponse>(
        {
          success: false,
          status: 'pending',
          error: 'Invalid request data',
        },
        { status: 400 }
      )
    }

    const { packId } = parseResult.data
    const creditPack = getCreditPack(packId)

    if (!creditPack) {
      return NextResponse.json<CardPaymentResponse>(
        {
          success: false,
          status: 'pending',
          error: 'Unknown credit pack',
        },
        { status: 400 }
      )
    }

    const paymentReference = crypto.randomUUID()

    // payment_events is admin-only under RLS — the intent record must be
    // written with the service-role client, and a failed write must not be
    // silently ignored or the payment becomes unreconcilable
    const adminClient: SupabaseClient = createAdminClient()
    const { error: eventError } = await adminClient.from('payment_events').insert({
      id: paymentReference,
      provider: PAYMENT_PROVIDER,
      provider_event_id: paymentReference,
      event_type: 'payment.created',
      processed: false,
      payload: {
        userId: user.id,
        packId,
        amountUsdCents: creditPack.price,
        creditAmount: creditPack.amount,
        providerLabel: PROVIDER_LABEL[PAYMENT_PROVIDER],
        createdAt: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    })

    if (eventError) {
      console.error('Failed to record payment intent:', eventError)
      return NextResponse.json<CardPaymentResponse>(
        {
          success: false,
          status: 'pending',
          error: 'Unable to initiate card payment',
        },
        { status: 500 }
      )
    }

    const response: CardPaymentResponse = {
      success: true,
      status: 'pending',
      paymentReference,
      requiresProviderSetup: !PAYMENTCLOUD_API_KEY,
    }

    if (!PAYMENTCLOUD_API_KEY) {
      return NextResponse.json(response, { status: 202 })
    }

    // NOTE: Once PaymentCloud credentials are available, call their API here and
    // return a redirect URL or status for front-end to continue the flow.
    return NextResponse.json(response)
  } catch (error) {
    console.error('PaymentCloud card create failed:', error)
    return NextResponse.json<CardPaymentResponse>(
      {
        success: false,
        status: 'pending',
        error: 'Unable to initiate card payment',
      },
      { status: 500 }
    )
  }
}
