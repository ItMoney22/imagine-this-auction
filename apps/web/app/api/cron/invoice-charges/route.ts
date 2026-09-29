import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  CHARGEABLE_STATUSES,
  chargeInvoice,
  notifyUnpaidInvoice,
  selectExhaustedInvoices,
  selectRetryableInvoices,
  type CardOnFileTimestamp,
  type RetryCandidate,
} from '@/lib/payments/invoice-charge'

/**
 * Cron entrypoint for the card-on-file collection cycle.
 *
 * ITA charges the winner's card on file when the invoice is raised, retries
 * once (MAX_CHARGE_ATTEMPTS, RETRY_DELAY_MS), and then stops and hands the
 * invoice to the auction house to collect at pickup — the lot is not eligible
 * for delivery until it is paid in full. This route is the retry-and-hand-over
 * half of that: the close path makes the first attempt.
 *
 * Every step is idempotent, so running hourly is safe: `chargeInvoice` claims
 * each row with a conditional UPDATE, and `notifyUnpaidInvoice` records the
 * hand-over as a `payment_events` row so the auction house is told once.
 *
 * Vercel crons issue GET with `Authorization: Bearer CRON_SECRET`.
 */

/** Rows examined per run. Well above a realistic backlog, small enough to stay inside maxDuration. */
const CANDIDATE_LIMIT = 200

/** Charges run one at a time: the gateway is rate-limited and order keeps the logs readable. */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Cron authorization required' }, { status: 401 })
  }

  try {
    const admin: SupabaseClient = createAdminClient()

    const { data: invoiceRows, error: invoiceError } = await admin
      .from('invoices')
      .select('id, buyer_id, payment_status, attempts, last_attempt_at, created_at')
      .in('payment_status', [...CHARGEABLE_STATUSES])
      .order('created_at', { ascending: true })
      .limit(CANDIDATE_LIMIT)

    if (invoiceError) {
      console.error('[invoice-charges] could not load candidates', invoiceError)
      return NextResponse.json({ success: false, error: invoiceError.message }, { status: 500 })
    }

    const candidates = (invoiceRows ?? []).map((row) => ({
      id: row.id as string,
      buyer_id: row.buyer_id as string,
      payment_status: row.payment_status as RetryCandidate['payment_status'],
      attempts: (row.attempts as number | null) ?? 0,
      last_attempt_at: (row.last_attempt_at as string | null) ?? null,
      created_at: row.created_at as string,
    })) satisfies RetryCandidate[]

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, examined: 0, charged: [], handedOver: [] })
    }

    const buyerIds = [...new Set(candidates.map((invoice) => invoice.buyer_id))]
    const { data: cardRows, error: cardError } = await admin
      .from('bidder_payment_methods')
      .select('user_id, updated_at, verified_at')
      .in('user_id', buyerIds)

    if (cardError) {
      console.error('[invoice-charges] could not load cards on file', cardError)
      return NextResponse.json({ success: false, error: cardError.message }, { status: 500 })
    }

    const cards = (cardRows ?? []).map((row) => ({
      user_id: row.user_id as string,
      updated_at: row.updated_at as string,
      verified_at: (row.verified_at as string | null) ?? null,
    })) satisfies CardOnFileTimestamp[]

    const toCharge = selectRetryableInvoices(candidates, cards, new Date())
    const charged: { invoiceId: string; outcome: string }[] = []
    for (const invoiceId of toCharge) {
      const result = await chargeInvoice(invoiceId)
      charged.push({ invoiceId, outcome: result.outcome })
    }

    // Invoices that just used their last attempt are picked up on the next run,
    // which is what keeps the hand-over notice and the charge out of the same
    // transaction: the notice only goes out once the row is settled as failed.
    const handedOver: { invoiceId: string; outcome: string }[] = []
    for (const invoiceId of selectExhaustedInvoices(candidates)) {
      const result = await notifyUnpaidInvoice(invoiceId)
      if (result.outcome === 'notified') handedOver.push({ invoiceId, outcome: result.outcome })
    }

    return NextResponse.json({
      success: true,
      examined: candidates.length,
      charged,
      handedOver,
    })
  } catch (error) {
    console.error('[invoice-charges] cron failed', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
