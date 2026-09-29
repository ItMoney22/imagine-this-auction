import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseNmiEventStore, processNmiWebhook } from '@/lib/payments/nmi-webhook'

// Side-effect import: invoice-handlers registers the sale/refund/void/chargeback
// handlers on the shared registry when it is evaluated, and nothing else on this
// route imports it. Without this line every event stores with handled: false.
import '@/lib/payments/invoice-handlers'

/**
 * POST /api/webhooks/nmi
 *
 * Receives NMI gateway webhooks. The flow lives in lib/payments/nmi-webhook.ts:
 * signature over the raw body -> schema -> insert-if-new -> atomic claim ->
 * dispatch -> mark processed.
 *
 * Status codes: 200 handled, unhandled-but-stored, or already-processed
 * duplicate; 409 another delivery of the same event is in flight (NMI
 * retries); 401 bad signature; 400 bad JSON or schema; 500 store or handler
 * failure (NMI retries).
 */

// A request must never outlive its own claim (NMI_CLAIM_STALE_MS = 2 min),
// otherwise a takeover by a retry could overlap with a still-running handler.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  // The signature covers the exact bytes NMI sent; read them before any parsing.
  const rawBody = await request.text()

  const outcome = await processNmiWebhook(
    {
      rawBody,
      signatureHeader: request.headers.get('webhook-signature'),
      signingKey: process.env.NMI_WEBHOOK_SIGNING_KEY,
    },
    { store: createSupabaseNmiEventStore(() => createAdminClient()) }
  )

  return NextResponse.json(outcome.body, { status: outcome.status })
}
