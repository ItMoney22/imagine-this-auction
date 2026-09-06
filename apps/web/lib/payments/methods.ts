import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { NmiError } from '@/lib/payments/nmi'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/types/database'

/**
 * Bidder payment methods: the one card each bidder keeps on file.
 *
 * ITA never sees a card number. Collect.js tokenizes it in the browser, the
 * server exchanges the token for an NMI Customer Vault id, and only that id
 * plus brand / last4 / expiry are stored (migration 020). Reads go through
 * the `bidder_payment_methods_public` view, which omits the vault id; writes
 * go through the service-role client, because the table has no INSERT /
 * UPDATE / DELETE policy for signed-in users.
 */

/**
 * Untyped on purpose. The hand-written `Database` type does not satisfy
 * supabase-js's GenericSchema, so a typed client resolves `.upsert()` values
 * to `never` (see the note in lib/supabase/admin.ts and the same pattern in
 * lib/payments/nmi-webhook.ts). Row shapes are asserted at the edges instead.
 */
type Db = SupabaseClient

/** Service-role client for the writes below. */
export function paymentMethodsAdmin(): Db {
  return createAdminClient() as unknown as Db
}

type PublicRow = Database['public']['Views']['bidder_payment_methods_public']['Row']
type TableRow = Database['public']['Tables']['bidder_payment_methods']['Row']

const PUBLIC_COLUMNS = 'user_id, card_brand, last4, exp_month, exp_year, verified_at'

/** Body of POST /api/payments/methods. */
export const PaymentMethodRequestSchema = z.object({
  /** One-time token minted by Collect.js. Opaque; only its presence is checked. */
  paymentToken: z.string().trim().min(1, 'Card token is required').max(512),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
})

export type PaymentMethodRequest = z.infer<typeof PaymentMethodRequestSchema>

/** What the browser is allowed to know about a card on file. */
export interface PaymentMethodPublic {
  /** Lower-case brand from the gateway (`visa`, `mastercard`, ...) or null when it was not returned. */
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  /** True once the gateway has confirmed the card is chargeable. Bidding requires this. */
  verified: boolean
  verifiedAt: string | null
}

type PublicSource = Pick<PublicRow, 'card_brand' | 'last4' | 'exp_month' | 'exp_year' | 'verified_at'>

/**
 * Map a view (or table) row to the API shape. Copies named fields only, so a
 * caller that passes a full table row by mistake still cannot leak the vault
 * id or the user id.
 */
export function toPaymentMethodPublic(row: PublicSource): PaymentMethodPublic {
  return {
    brand: row.card_brand ?? null,
    last4: row.last4 ?? null,
    expMonth: row.exp_month ?? null,
    expYear: row.exp_year ?? null,
    verified: row.verified_at != null,
    verifiedAt: row.verified_at ?? null,
  }
}

/**
 * The caller's card on file, or null when none. Reads through the public view
 * with the caller's own client, so RLS limits it to their row and the vault
 * id is never selected.
 */
export async function getPaymentMethodPublic(supabase: Db, userId: string): Promise<PaymentMethodPublic | null> {
  const { data, error } = await supabase
    .from('bidder_payment_methods_public')
    .select(PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load payment method: ${error.message}`)
  if (!data) return null
  return toPaymentMethodPublic(data as PublicSource)
}

export interface UpsertPaymentMethodInput {
  userId: string
  customerVaultId: string
  brand?: string | null
  last4?: string | null
  expMonth?: number | null
  expYear?: number | null
  /** ISO timestamp when the gateway verified the card; null when it declined. */
  verifiedAt: string | null
  /** From validateCard: the $1.00 verification auth that could not be voided, if any. */
  unvoidedAuthTransactionId?: string | null
}

/**
 * Insert or replace the bidder's single payment method (one row per user,
 * `user_id` is UNIQUE). Service-role only. Replacing a card overwrites the
 * vault id; the previous vault record is left in the gateway.
 */
export async function upsertPaymentMethod(admin: Db, input: UpsertPaymentMethodInput): Promise<PaymentMethodPublic> {
  const row: Database['public']['Tables']['bidder_payment_methods']['Insert'] = {
    user_id: input.userId,
    provider: 'nmi',
    customer_vault_id: input.customerVaultId,
    card_brand: input.brand ?? null,
    last4: input.last4 ?? null,
    exp_month: input.expMonth ?? null,
    exp_year: input.expYear ?? null,
    verified_at: input.verifiedAt,
    unvoided_auth_transaction_id: input.unvoidedAuthTransactionId ?? null,
  }

  const { data, error } = await admin
    .from('bidder_payment_methods')
    .upsert(row, { onConflict: 'user_id' })
    .select(PUBLIC_COLUMNS)
    .single()

  if (error) throw new Error(`Failed to save payment method: ${error.message}`)
  return toPaymentMethodPublic(data as Pick<TableRow, keyof PublicSource>)
}

/** Remove the bidder's row. The gateway record is the caller's (best-effort) job. */
export async function deletePaymentMethod(admin: Db, userId: string): Promise<void> {
  const { error } = await admin.from('bidder_payment_methods').delete().eq('user_id', userId)
  if (error) throw new Error(`Failed to remove payment method: ${error.message}`)
}

/**
 * What the service role needs to act on the stored card. Never sent to a
 * browser: it carries the vault id.
 */
export interface PaymentMethodRecord {
  customerVaultId: string
  unvoidedAuthTransactionId: string | null
  verifiedAt: string | null
}

export async function getPaymentMethodRecord(admin: Db, userId: string): Promise<PaymentMethodRecord | null> {
  const { data, error } = await admin
    .from('bidder_payment_methods')
    .select('customer_vault_id, unvoided_auth_transaction_id, verified_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load payment method record: ${error.message}`)
  if (!data) return null
  const row = data as Pick<TableRow, 'customer_vault_id' | 'unvoided_auth_transaction_id' | 'verified_at'>
  return {
    customerVaultId: row.customer_vault_id,
    unvoidedAuthTransactionId: row.unvoided_auth_transaction_id ?? null,
    verifiedAt: row.verified_at ?? null,
  }
}

export interface SaveCardInput {
  userId: string
  paymentToken: string
  firstName: string
  lastName: string
  email: string
}

/** The gateway and database calls saveCardOnFile makes, injected so the flow is unit-testable. */
export interface SaveCardDeps {
  /** addCustomerVault: token -> vault record. Throws NmiError when the gateway rejects the token. */
  addVault: (options: { paymentToken: string; firstName: string; lastName: string; email: string }) => Promise<{
    customerVaultId: string
    brand?: string
    last4?: string
    expMonth?: number
    expYear?: number
  }>
  /** validateCard: is the vaulted card chargeable? Declines come back as ok: false, not as throws. */
  validate: (options: { customerVaultId: string; processorId?: string }) => Promise<{
    ok: boolean
    message: string
    unvoidedAuthTransactionId?: string
  }>
  /** The bidder's current row, if any. */
  existing: PaymentMethodRecord | null
  upsert: (input: UpsertPaymentMethodInput) => Promise<PaymentMethodPublic>
  /** deleteCustomerVault, best effort: failures are logged and never change the outcome. */
  deleteVault?: (customerVaultId: string) => Promise<unknown>
  /** Merchant account the verification is routed to (ITA's own MID). */
  processorId?: string
  /** Clock for verified_at; injectable for tests. */
  now?: () => string
}

export type SaveCardResult =
  | { status: 200; body: PaymentMethodPublic }
  | { status: 402 | 500 | 502; body: { error: string } }

const GATEWAY_UNAVAILABLE_MESSAGE = 'Card service is unavailable. Try again in a moment.'
const VERIFY_UNAVAILABLE_MESSAGE = 'Card verification is unavailable right now. Try again in a moment.'
const SAVE_FAILED_MESSAGE = 'Could not save your card. Try again.'

/**
 * POST /api/payments/methods without the HTTP: token -> vault -> verify ->
 * store, with every gateway and database call injected.
 *
 * The one rule: the stored row changes ONLY after the gateway has verified
 * the new card. A decline (402) or an outage (502) leaves whatever the bidder
 * had on file untouched, so replacing a good card with a bad one can never
 * take away their ability to bid or show the old card as verified when it is
 * not. A vault record that will not be referenced (new card declined, or the
 * old card after a successful replace) is deleted at the gateway, best effort.
 */
export async function saveCardOnFile(deps: SaveCardDeps, input: SaveCardInput): Promise<SaveCardResult> {
  const now = deps.now ?? (() => new Date().toISOString())

  const discardVault = async (customerVaultId: string) => {
    if (!deps.deleteVault) return
    try {
      await deps.deleteVault(customerVaultId)
    } catch (error) {
      console.warn('[payments] could not delete customer vault record', {
        customerVaultId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // 1. Token -> Customer Vault record. A rejected token is a card problem
  //    (402); anything else is the gateway being unreachable (502).
  let vault: Awaited<ReturnType<SaveCardDeps['addVault']>>
  try {
    vault = await deps.addVault({
      paymentToken: input.paymentToken,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
    })
  } catch (error) {
    if (error instanceof NmiError && error.response) {
      return { status: 402, body: { error: friendlyGatewayMessage(error.response.responsetext) } }
    }
    return { status: 502, body: { error: GATEWAY_UNAVAILABLE_MESSAGE } }
  }

  // 2. Verify the card is chargeable. Nothing is stored unless this passes.
  let verification: Awaited<ReturnType<SaveCardDeps['validate']>>
  try {
    verification = await deps.validate({ customerVaultId: vault.customerVaultId, processorId: deps.processorId })
  } catch {
    await discardVault(vault.customerVaultId)
    return { status: 502, body: { error: VERIFY_UNAVAILABLE_MESSAGE } }
  }

  if (!verification.ok) {
    await discardVault(vault.customerVaultId)
    return { status: 402, body: { error: friendlyGatewayMessage(verification.message) } }
  }

  // 3. Store the verified card. A prior unvoided $1.00 auth is kept on the
  //    row unless this verification produced a new one; support may still
  //    need to void it.
  let saved: PaymentMethodPublic
  try {
    saved = await deps.upsert({
      userId: input.userId,
      customerVaultId: vault.customerVaultId,
      brand: vault.brand ?? null,
      last4: vault.last4 ?? null,
      expMonth: vault.expMonth ?? null,
      expYear: vault.expYear ?? null,
      verifiedAt: now(),
      unvoidedAuthTransactionId:
        verification.unvoidedAuthTransactionId ?? deps.existing?.unvoidedAuthTransactionId ?? null,
    })
  } catch {
    await discardVault(vault.customerVaultId)
    return { status: 500, body: { error: SAVE_FAILED_MESSAGE } }
  }

  // 4. The replaced card's vault record is no longer referenced.
  if (deps.existing && deps.existing.customerVaultId !== vault.customerVaultId) {
    await discardVault(deps.existing.customerVaultId)
  }

  return { status: 200, body: saved }
}

const DEFAULT_DECLINE_MESSAGE = 'Your card was declined. Check the details or try another card.'

/**
 * Gateway `responsetext` -> something a bidder can act on. NMI appends
 * `REFID:<n>` to many messages; that is for support tickets, not bidders.
 * An empty or "SUCCESS" text on a failure path means the gateway gave no
 * reason, so a plain decline sentence is used instead.
 */
export function friendlyGatewayMessage(text: string | undefined | null): string {
  const cleaned = (text ?? '')
    .replace(/\s*REFID:\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned || /^success$/i.test(cleaned)) return DEFAULT_DECLINE_MESSAGE
  return cleaned
}

const MAX_RETURN_PATH_LENGTH = 512

/**
 * Validate a `?next=` target: a same-site absolute path only. Anything that
 * could leave the site (scheme, protocol-relative `//`, backslash tricks,
 * control characters) is rejected so /account/payment cannot be used as an
 * open redirect.
 */
export function sanitizeReturnPath(next: unknown): string | null {
  if (typeof next !== 'string') return null
  if (next.length === 0 || next.length > MAX_RETURN_PATH_LENGTH) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  // Backslash (browsers treat `/\` like `//`), whitespace, and control characters.
  if (/[\\\s\u0000-\u001f]/.test(next)) return null
  return next
}

/** `/account/payment`, with `?next=` when a valid return path is given. */
export function paymentMethodPagePath(next?: string | null): string {
  const safe = sanitizeReturnPath(next)
  return safe ? `/account/payment?next=${encodeURIComponent(safe)}` : '/account/payment'
}
