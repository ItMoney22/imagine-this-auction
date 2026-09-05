import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseNmiEventStore, processNmiWebhook } from '@/lib/payments/nmi-webhook'

// Task 4c: import the module that registers the real handlers here (for
// example `import '@/lib/payments/invoice-handlers'`). Handlers register on
// module evaluation, and nothing else imports them on this route.

/**
 * POST /api/webhooks/nmi
 *
 * Receives NMI gateway webhooks. The flow lives in lib/payments/nmi-webhook.ts:
 * signature over the raw body -> schema -> insert-if-new -> atomic claim ->
 * dispatch -> mark processed.
 *
 * Status codes: 200 handled, unhandled-but-stored, or duplicate; 401 bad
 * signature; 400 bad JSON or schema; 500 store or handler failure (NMI retries).
 */
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
