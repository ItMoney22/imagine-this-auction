/**
 * In-memory sliding-window rate limiter.
 *
 * The AI routes rate-limit through a Postgres RPC (`ai_check_rate_limit`)
 * because their limits are per action and admin-editable. Card capture needs
 * something simpler and faster: a hard cap on how often one user may send a
 * Collect.js token to the gateway, so a stolen session cannot be used to test
 * card numbers. A Map keyed by user id is enough for that.
 *
 * Scope: one process. On a serverless host every warm instance keeps its own
 * counts, so the effective limit is `limit` per instance per window. That is
 * acceptable for an abuse brake (the gateway has its own velocity controls);
 * it is not a billing-grade quota.
 */

export interface RateLimitOptions {
  /** Attempts allowed inside one window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitDecision {
  allowed: boolean
  /** Attempts left in the window after this one (0 when refused). */
  remaining: number
  /** Whole seconds until the oldest counted attempt expires; 0 when allowed. */
  retryAfterSeconds: number
}

export interface RateLimiter {
  /** Record an attempt for `key` at `now` (ms) and say whether it is allowed. */
  check(key: string, now?: number): RateLimitDecision
  /** Forget one key, or every key when omitted. */
  reset(key?: string): void
}

/** POST /api/payments/methods: 5 card-save attempts per minute per user. */
export const PAYMENT_METHODS_RATE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60_000 }

/** Above this many tracked keys, each check also drops keys with no live attempts. */
const SWEEP_THRESHOLD = 5_000

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs } = options
  if (!Number.isFinite(limit) || limit <= 0) throw new RangeError(`limit must be positive, got ${limit}`)
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError(`windowMs must be positive, got ${windowMs}`)

  /** Timestamps (ms) of counted attempts per key, oldest first. */
  const attempts = new Map<string, number[]>()

  function prune(stamps: number[], now: number): number[] {
    const cutoff = now - windowMs
    let firstLive = 0
    while (firstLive < stamps.length && stamps[firstLive] <= cutoff) firstLive++
    return firstLive === 0 ? stamps : stamps.slice(firstLive)
  }

  function sweep(now: number) {
    for (const [key, stamps] of attempts) {
      if (prune(stamps, now).length === 0) attempts.delete(key)
    }
  }

  return {
    check(key, now = Date.now()) {
      if (attempts.size > SWEEP_THRESHOLD) sweep(now)

      const live = prune(attempts.get(key) ?? [], now)

      if (live.length >= limit) {
        // Refusals are not recorded, so a blocked caller's window is not pushed
        // out by their own retries.
        attempts.set(key, live)
        const oldest = live[0]
        const retryAfterMs = Math.max(oldest + windowMs - now, 1)
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
      }

      live.push(now)
      attempts.set(key, live)
      return { allowed: true, remaining: limit - live.length, retryAfterSeconds: 0 }
    },

    reset(key) {
      if (key === undefined) attempts.clear()
      else attempts.delete(key)
    },
  }
}

/** Shared instance for the payment-methods route (module scope = per process). */
export const paymentMethodsLimiter = createRateLimiter(PAYMENT_METHODS_RATE_LIMIT)
