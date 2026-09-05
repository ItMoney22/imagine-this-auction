import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { addCustomerVault, NmiError, validateCard } from '@/lib/payments/nmi'
import {
  deletePaymentMethod,
  friendlyGatewayMessage,
  getPaymentMethodPublic,
  PaymentMethodRequestSchema,
  paymentMethodsAdmin,
  upsertPaymentMethod,
} from '@/lib/payments/methods'
import { paymentMethodsLimiter } from '@/lib/payments/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// validateCard can make up to three gateway calls (validate, auth, void).
export const maxDuration = 60

/**
 * The bidder's card on file.
 *
 *   GET     -> { brand, last4, expMonth, expYear, verified, verifiedAt } or 404
 *   POST    -> body { paymentToken, firstName, lastName }; vaults the Collect.js
 *              token, verifies the card, stores the vault reference. 200 when
 *              verified, 402 with the gateway's message when declined.
 *   DELETE  -> removes the row. Does not contact the gateway.
 *
 * The card number never reaches this route: Collect.js tokenizes it in the
 * browser and only the one-time token is posted here.
 */

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { ok: true as const, supabase, user }
}

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const method = await getPaymentMethodPublic(auth.supabase, auth.user.id)
    if (!method) return NextResponse.json({ error: 'No payment method on file' }, { status: 404 })
    return NextResponse.json(method)
  } catch (error) {
    console.error('[payments] failed to load payment method', error)
    return NextResponse.json({ error: 'Could not load your payment method' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { supabase, user } = auth

  // Counted before any gateway call, and counted whether or not the card is
  // later declined, so a session cannot be used to test card numbers.
  const limit = paymentMethodsLimiter.check(user.id)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute and try again.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request', details: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = PaymentMethodRequestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { paymentToken, firstName, lastName } = parsed.data

  // The vault record carries an email for the gateway's receipts and search.
  const { data: profile } = await supabase.from('users').select('email').eq('id', user.id).maybeSingle()
  const email = (profile as { email?: string | null } | null)?.email ?? user.email ?? ''

  // 1. Token -> Customer Vault record. A rejected token is a card problem
  //    (402); anything else is the gateway being unreachable (502).
  let vault: Awaited<ReturnType<typeof addCustomerVault>>
  try {
    vault = await addCustomerVault({ paymentToken, firstName, lastName, email })
  } catch (error) {
    if (error instanceof NmiError && error.response) {
      console.warn('[payments] customer vault add rejected', {
        userId: user.id,
        code: error.response.response_code,
      })
      return NextResponse.json({ error: friendlyGatewayMessage(error.response.responsetext) }, { status: 402 })
    }
    console.error('[payments] customer vault add failed', error)
    return NextResponse.json({ error: 'Card service is unavailable. Try again in a moment.' }, { status: 502 })
  }

  // 2. Verify the card is chargeable. Routed to ITA's own merchant account when
  //    configured so the $1.00 fallback auth never lands on an auctioneer's MID.
  const processorId = process.env.NMI_PLATFORM_PROCESSOR_ID?.trim() || undefined
  let verification: Awaited<ReturnType<typeof validateCard>> | null = null
  try {
    verification = await validateCard({ customerVaultId: vault.customerVaultId, processorId })
  } catch (error) {
    console.error('[payments] card verification call failed', error)
  }

  // 3. Persist the vault reference either way; verified_at only when the
  //    gateway approved. An unverified row still shows the bidder which card
  //    they entered so they can replace it.
  let saved
  try {
    saved = await upsertPaymentMethod(paymentMethodsAdmin(), {
      userId: user.id,
      customerVaultId: vault.customerVaultId,
      brand: vault.brand ?? null,
      last4: vault.last4 ?? null,
      expMonth: vault.expMonth ?? null,
      expYear: vault.expYear ?? null,
      verifiedAt: verification?.ok ? new Date().toISOString() : null,
      unvoidedAuthTransactionId: verification?.unvoidedAuthTransactionId ?? null,
    })
  } catch (error) {
    console.error('[payments] failed to store payment method', error)
    return NextResponse.json({ error: 'Could not save your card. Try again.' }, { status: 500 })
  }

  if (!verification) {
    return NextResponse.json(
      { error: 'Your card was saved but could not be verified yet. Try again in a moment.', ...saved },
      { status: 502 }
    )
  }

  if (!verification.ok) {
    console.warn('[payments] card verification declined', { userId: user.id, message: verification.message })
    return NextResponse.json({ error: friendlyGatewayMessage(verification.message), ...saved }, { status: 402 })
  }

  return NextResponse.json(saved)
}

export async function DELETE() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    await deletePaymentMethod(paymentMethodsAdmin(), auth.user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[payments] failed to remove payment method', error)
    return NextResponse.json({ error: 'Could not remove your card. Try again.' }, { status: 500 })
  }
}
