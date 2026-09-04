import { adminRpc, createAdminClient } from '@/lib/supabase/admin'
import type { AiActionPrice } from '@/lib/ai/quick-listing'

/**
 * Server-side ITC credit primitives for AI actions.
 *
 * The contract every AI route follows:
 *
 *   1. `beginAiAction`  — reserve (no wallet movement, blocks overdraft)
 *   2. run the provider
 *   3. `settleAiAction` — success: the only place credits actually leave
 *      `voidAiAction`  — failure: reservation released, nothing charged
 *
 * Reservations are keyed by `idempotency_key`, so a retried or double-tapped
 * request reuses the same ledger row instead of charging twice.
 */

export type AiCreditErrorCode =
  | 'unknown_action'
  | 'action_disabled'
  | 'insufficient_credits'
  | 'rate_limited'
  | 'unknown_ledger_entry'
  | 'not_pending'

export interface AiActionReservation {
  ledgerId: string
  creditCost: number
  status: 'pending' | 'charged' | 'refunded' | 'voided' | 'failed'
  /** True when an existing ledger row was returned for the same key. */
  reused: boolean
  availableAfter?: number
}

export interface AiCreditFailure {
  ok: false
  code: AiCreditErrorCode
  message: string
  creditCost?: number
  available?: number
  limit?: number
}

export type BeginActionResult =
  | ({ ok: true } & AiActionReservation)
  | AiCreditFailure

const FAILURE_MESSAGES: Record<AiCreditErrorCode, string> = {
  unknown_action: 'That AI action is not configured.',
  action_disabled: 'This AI action is currently turned off by the platform admin.',
  insufficient_credits: 'Not enough ITC credits for this action.',
  rate_limited: 'You have used this AI action too many times in the last hour.',
  unknown_ledger_entry: 'That AI charge could not be found.',
  not_pending: 'That AI charge is no longer pending.',
}

export async function listAiActionPrices(): Promise<AiActionPrice[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_action_prices')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load AI prices: ${error.message}`)

  return (data ?? []) as unknown as AiActionPrice[]
}

export async function getAiActionPrice(actionKey: string): Promise<AiActionPrice | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_action_prices')
    .select('*')
    .eq('action_key', actionKey)
    .maybeSingle()

  if (error) throw new Error(`Failed to load AI price: ${error.message}`)

  return (data as unknown as AiActionPrice) ?? null
}

/** Wallet balance minus in-flight AI reservations. */
export async function getAvailableCredits(userId: string): Promise<number> {
  const { data, error } = await adminRpc<number>('ai_available_credits', { p_user_id: userId })

  if (error) throw new Error(`Failed to read available credits: ${error.message}`)

  return typeof data === 'number' ? data : 0
}

export async function checkAiRateLimit(
  userId: string,
  actionKey: string,
  maxPerHour: number
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const { data, error } = await adminRpc<Record<string, unknown>>('ai_check_rate_limit', {
    p_user_id: userId,
    p_action_key: actionKey,
    p_max_per_hour: maxPerHour,
  })

  if (error) throw new Error(`Rate limit check failed: ${error.message}`)

  const result = (data ?? {}) as { allowed?: boolean; used?: number; limit?: number }

  return {
    allowed: result.allowed !== false,
    used: result.used ?? 0,
    limit: result.limit ?? maxPerHour,
  }
}

export interface BeginActionInput {
  userId: string
  actionKey: string
  idempotencyKey: string
  auctioneerId?: string | null
  draftId?: string | null
  lotId?: string | null
  imageJobId?: string | null
  requestMetadata?: Record<string, unknown>
}

/**
 * Reserve credits. Nothing leaves the wallet here — the reservation only makes
 * the pending spend visible to `ai_available_credits`, so two concurrent taps
 * cannot both pass a balance check for credits only one of them can have.
 */
export async function beginAiAction(input: BeginActionInput): Promise<BeginActionResult> {
  const { data, error } = await adminRpc<Record<string, unknown>>('ai_begin_action', {
    p_user_id: input.userId,
    p_action_key: input.actionKey,
    p_idempotency_key: input.idempotencyKey,
    p_auctioneer_id: input.auctioneerId ?? null,
    p_draft_id: input.draftId ?? null,
    p_lot_id: input.lotId ?? null,
    p_image_job_id: input.imageJobId ?? null,
    p_request_metadata: input.requestMetadata ?? {},
  })

  if (error) throw new Error(`Failed to reserve AI credits: ${error.message}`)

  const result = (data ?? {}) as Record<string, unknown>

  if (result.ok !== true) {
    const code = (result.error as AiCreditErrorCode) ?? 'unknown_action'

    return {
      ok: false,
      code,
      message: FAILURE_MESSAGES[code] ?? 'Unable to start this AI action.',
      creditCost: typeof result.credit_cost === 'number' ? result.credit_cost : undefined,
      available: typeof result.available === 'number' ? result.available : undefined,
    }
  }

  return {
    ok: true,
    ledgerId: String(result.ledger_id),
    creditCost: Number(result.credit_cost ?? 0),
    status: (result.status as AiActionReservation['status']) ?? 'pending',
    reused: result.reused === true,
    availableAfter:
      typeof result.available === 'number' ? (result.available as number) : undefined,
  }
}

export interface SettleActionInput {
  ledgerId: string
  provider?: string | null
  providerJobId?: string | null
  resultMetadata?: Record<string, unknown>
}

/** Success path — the single place ITC is deducted for an AI action. */
export async function settleAiAction(
  input: SettleActionInput
): Promise<{ ok: boolean; charged: number; balanceAfter?: number; error?: string }> {
  const { data, error } = await adminRpc<Record<string, unknown>>('ai_settle_action', {
    p_ledger_id: input.ledgerId,
    p_provider: input.provider ?? null,
    p_provider_job_id: input.providerJobId ?? null,
    p_result_metadata: input.resultMetadata ?? {},
  })

  if (error) throw new Error(`Failed to settle AI credits: ${error.message}`)

  const result = (data ?? {}) as Record<string, unknown>

  return {
    ok: result.ok === true,
    charged: Number(result.charged ?? 0),
    balanceAfter:
      typeof result.balance_after === 'number' ? (result.balance_after as number) : undefined,
    error: typeof result.error === 'string' ? result.error : undefined,
  }
}

/**
 * Failure path. Safe to call unconditionally in a `catch` — voiding an entry
 * that was already charged escalates to a refund inside the database function.
 */
export async function voidAiAction(ledgerId: string, reason: string): Promise<void> {
  const { error } = await adminRpc('ai_void_action', {
    p_ledger_id: ledgerId,
    p_reason: reason.slice(0, 500),
  })

  if (error) {
    // Never let bookkeeping cleanup mask the original failure.
    console.error('[ai-credits] void failed', { ledgerId, reason, error: error.message })
  }
}

export async function refundAiAction(ledgerId: string, reason: string): Promise<void> {
  const { error } = await adminRpc('ai_refund_action', {
    p_ledger_id: ledgerId,
    p_reason: reason.slice(0, 500),
  })

  if (error) {
    console.error('[ai-credits] refund failed', { ledgerId, reason, error: error.message })
  }
}

/**
 * Wraps the reserve → run → settle/void lifecycle so individual routes cannot
 * forget the failure path.
 */
export async function withAiCredits<T>(
  input: BeginActionInput,
  run: (reservation: AiActionReservation) => Promise<{
    result: T
    provider?: string | null
    providerJobId?: string | null
    resultMetadata?: Record<string, unknown>
  }>
): Promise<
  | { ok: true; result: T; charged: number; ledgerId: string; balanceAfter?: number }
  | AiCreditFailure
> {
  const reservation = await beginAiAction(input)

  if (!reservation.ok) return reservation

  // A reused *charged* entry means this exact request already succeeded and was
  // paid for. Re-running it would double-charge, so the caller must handle the
  // replay itself (routes return the stored artifact instead).
  if (reservation.reused && reservation.status !== 'pending') {
    return {
      ok: false,
      code: 'not_pending',
      message: 'This request was already processed.',
      creditCost: reservation.creditCost,
    }
  }

  try {
    const outcome = await run(reservation)

    const settlement = await settleAiAction({
      ledgerId: reservation.ledgerId,
      provider: outcome.provider,
      providerJobId: outcome.providerJobId,
      resultMetadata: outcome.resultMetadata,
    })

    if (!settlement.ok) {
      return {
        ok: false,
        code: (settlement.error as AiCreditErrorCode) ?? 'insufficient_credits',
        message:
          FAILURE_MESSAGES[(settlement.error as AiCreditErrorCode) ?? 'insufficient_credits'],
        creditCost: reservation.creditCost,
      }
    }

    return {
      ok: true,
      result: outcome.result,
      charged: settlement.charged,
      ledgerId: reservation.ledgerId,
      balanceAfter: settlement.balanceAfter,
    }
  } catch (error) {
    await voidAiAction(
      reservation.ledgerId,
      error instanceof Error ? error.message : 'provider_error'
    )
    throw error
  }
}
