import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { addCustomerVault, deleteCustomerVault, isApproved, validateCard } from '@/lib/payments/nmi'
import {
  deletePaymentMethod,
  getPaymentMethodPublic,
  getPaymentMethodRecord,
  PaymentMethodRequestSchema,
  paymentMethodsAdmin,
  saveCardOnFile,
  upsertPaymentMethod,
  type PaymentMethodRecord,
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
 *              token, verifies the card, and stores the vault reference ONLY
 *              when verification passes. 200 verified; 402 declined (existing
 *              card untouched); 502 gateway unreachable (existing card untouched).
 *   DELETE  -> removes the row, then deletes the vault record at the gateway
 *              (best effort).
 *
 * The card number never reaches this route: Collect.js tokenizes it in the
 * browser and only the one-time token is posted here. The flow itself lives
 * in lib/payments/methods.ts (saveCardOnFile) where it is unit-tested.
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

/**
 * Delete a Customer Vault record, best effort. A decline is logged (the
 * gateway may already have dropped it); a throw is logged. Neither changes
 * the response the bidder gets.
 */
async function discardVaultQuietly(customerVaultId: string): Promise<void> {
  try {
    const response = await deleteCustomerVault({ customerVaultId })
    if (!isApproved(response)) {
      console.warn('[payments] customer vault delete was not approved', {
        code: response.response_code,
        message: response.responsetext,
      })
    }
  } catch (error) {
    console.warn('[payments] customer vault delete failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
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

  const admin = paymentMethodsAdmin()

  let existing: PaymentMethodRecord | null
  try {
    existing = await getPaymentMethodRecord(admin, user.id)
  } catch (error) {
    console.error('[payments] failed to load existing payment method', error)
    return NextResponse.json({ error: 'Could not load your payment method' }, { status: 500 })
  }

  const result = await saveCardOnFile(
    {
      addVault: (options) => addCustomerVault(options),
      validate: (options) => validateCard(options),
      existing,
      upsert: (input) => upsertPaymentMethod(admin, input),
      deleteVault: discardVaultQuietly,
      // Routed to ITA's own merchant account when configured so the $1.00
      // fallback auth never lands on an auctioneer's MID.
      processorId: process.env.NMI_PLATFORM_PROCESSOR_ID?.trim() || undefined,
    },
    { userId: user.id, paymentToken, firstName, lastName, email }
  )

  if (result.status !== 200) {
    console.warn('[payments] card was not saved', { userId: user.id, status: result.status, error: result.body.error })
  }
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const admin = paymentMethodsAdmin()
  try {
    const existing = await getPaymentMethodRecord(admin, auth.user.id)
    await deletePaymentMethod(admin, auth.user.id)
    // The row is gone; the gateway record is cleanup and must not fail the request.
    if (existing) await discardVaultQuietly(existing.customerVaultId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[payments] failed to remove payment method', error)
    return NextResponse.json({ error: 'Could not remove your card. Try again.' }, { status: 500 })
  }
}
