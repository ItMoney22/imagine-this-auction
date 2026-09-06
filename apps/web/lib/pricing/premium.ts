/**
 * Buyer's premium math, shared by every surface that tells a bidder what a
 * win will cost: the lot page disclosure, the bid button, invoices.
 *
 * All money is in integer cents. The rounding here MUST match the SQL that
 * settles the invoice in supabase/migrations/003_indexes_functions.sql:
 *
 *   ROUND(winning_bid.amount * auction_record.buyer_premium_percent / 100)
 *
 * so the number shown before the bid is the number charged after the win.
 *
 * Postgres evaluates that in exact decimal arithmetic. JavaScript does not:
 * `hammerCents * premiumPct` in binary floating point can land a hair below a
 * half-cent boundary for two-decimal percents (1500 * 5.1 = 7649.999...), and
 * Math.round then gives 76 where SQL gives 77. The percent column is
 * DECIMAL(5,2), so every value it can hold is a whole number of basis points;
 * converting to integer basis points first keeps the product exact in a
 * double (hammer and basis points are both well inside 2^53) and the single
 * division by 10000 rounds the same way ROUND does.
 *
 * Postgres ROUND on a numeric rounds half away from zero; for non-negative
 * inputs Math.round agrees. Negative hammers are rejected (see below).
 */

/**
 * `pct` percent of `cents`, rounded half up to the cent exactly like SQL
 * ROUND(cents * pct / 100). Shared by the buyer's premium and by every other
 * fee stated as a percent of hammer (the platform commission examples on the
 * marketing pages), so all of them round the same way.
 *
 * `pct` is expected to have at most two decimals (DECIMAL(5,2)); anything
 * finer is rounded to the nearest basis point first.
 */
export function percentOfCents(cents: number, pct: number): number {
  const basisPoints = Math.round(pct * 100)
  return Math.round((cents * basisPoints) / 10000)
}

/**
 * Premium in cents for a hammer price in cents at `premiumPct` percent.
 *
 * Throws RangeError for a negative hammer. A bid can never be negative
 * (lots.starting_bid has CHECK > 0 and bids only go up), so a negative hammer
 * is a caller bug, and because Math.round and SQL ROUND disagree on negative
 * halves there is no correct figure to return. Failing loudly beats settling
 * or disclosing a wrong number.
 */
export function computePremiumCents(hammerCents: number, premiumPct: number): number {
  if (hammerCents < 0) {
    throw new RangeError(`hammerCents must be non-negative, got ${hammerCents}`)
  }
  return percentOfCents(hammerCents, premiumPct)
}

/** Hammer plus premium, in cents. This is what the bidder's card is charged. */
export function computeTotalCents(hammerCents: number, premiumPct: number): number {
  return hammerCents + computePremiumCents(hammerCents, premiumPct)
}

/**
 * The premium percent is set per auction by the auctioneer and stored on the
 * auction record (auctions.buyer_premium_percent, DECIMAL(5,2) NOT NULL
 * DEFAULT 10.00). Because the column can never be null in the database, a
 * missing value means the auction record did not arrive whole, and the only
 * honest answer is "unknown": returns null so the caller can point the bidder
 * at the auction terms. It never falls back to 0%, which would promise a
 * lower total than the invoice.
 *
 * Accepts a numeric string because DECIMAL(5,2) can arrive as one. Uses
 * Number(), not parseFloat, so "10abc" is rejected rather than read as 10.
 */
export function premiumPercentForAuction(
  auction: { buyer_premium_percent?: number | string | null } | null | undefined
): number | null {
  const raw = auction?.buyer_premium_percent
  if (raw == null) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  const pct = Number(raw)
  if (!Number.isFinite(pct) || pct < 0) return null
  return pct
}

/**
 * Cents to a US dollar string with two decimals, e.g. 137500 -> "$1,375.00".
 * A fractional cent is rounded to the nearest cent first, so the string can
 * never show a value that the integer-cents ledger cannot hold.
 * Deliberately separate from lib/utils formatCurrency, which appends a credit
 * suffix. Bidders pay in dollars.
 */
export function formatUsd(cents: number | null | undefined): string {
  const value = cents == null || !Number.isFinite(cents) ? 0 : Math.round(cents)
  return (value / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "10%" or "12.5%": a percent for display, without trailing zeros. */
export function formatPremiumPercent(premiumPct: number): string {
  return `${Number(premiumPct.toFixed(2))}%`
}
