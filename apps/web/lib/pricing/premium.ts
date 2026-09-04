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
 * Postgres ROUND on a numeric rounds half away from zero; for non-negative
 * inputs Math.round agrees.
 */

/** Premium in cents for a hammer price in cents at `premiumPct` percent. */
export function computePremiumCents(hammerCents: number, premiumPct: number): number {
  return Math.round((hammerCents * premiumPct) / 100)
}

/** Hammer plus premium, in cents. This is what the bidder's card is charged. */
export function computeTotalCents(hammerCents: number, premiumPct: number): number {
  return hammerCents + computePremiumCents(hammerCents, premiumPct)
}

/**
 * The premium percent is set per auction by the auctioneer and stored on the
 * auction record (auctions.buyer_premium_percent, DECIMAL(5,2)). Never assume
 * a default; a missing or unparseable value is disclosed as 0% rather than
 * guessed, so the page can never promise a lower total than the invoice.
 */
export function premiumPercentForAuction(
  auction: { buyer_premium_percent?: number | string | null } | null | undefined
): number {
  const raw = auction?.buyer_premium_percent
  if (raw == null) return 0
  const pct = typeof raw === 'number' ? raw : Number.parseFloat(raw)
  if (!Number.isFinite(pct) || pct < 0) return 0
  return pct
}

/**
 * Cents to a US dollar string with two decimals, e.g. 137500 -> "$1,375.00".
 * Deliberately separate from lib/utils formatCurrency, which appends a credit
 * suffix. Bidders pay in dollars.
 */
export function formatUsd(cents: number | null | undefined): string {
  const value = cents == null || !Number.isFinite(cents) ? 0 : cents
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
