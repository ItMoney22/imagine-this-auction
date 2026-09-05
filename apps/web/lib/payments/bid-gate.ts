/**
 * Bid gate: may this person place a bid on this lot right now?
 *
 * Replaces the old prepaid-balance check. On the card-on-file model nothing
 * is charged at bid time, so the only questions
 * are identity, timing, and whether a verified card is on file to be charged
 * if the bid wins. Pure and synchronous so the bidding panel can call it on
 * every render and the unit tests can cover the whole matrix.
 *
 * Reasons are checked in this order, and the first failure wins:
 *   signed_out      no session; nothing else matters
 *   auction_closed  not between starts_at and the (live, anti-sniping
 *                   extended) end time; no point adding a card for it
 *   no_card         no payment method with verified_at set
 *   high_bidder     already leading; bidding against yourself is refused
 *
 * `no_card` is checked before `high_bidder` on purpose: a high bidder without
 * a card (possible for accounts that predate this gate) still needs one to be
 * charged on the win, so "add a card" is the more useful message.
 */

export type BidGateReason = 'signed_out' | 'auction_closed' | 'no_card' | 'high_bidder'

export interface BidGateInput {
  /** The signed-in user, or null/undefined when signed out. Only identity matters. */
  user: { id: string } | null | undefined
  /** Whether the auction is currently accepting bids. */
  auctionLive: boolean
  /** Whether the bidder has a payment method on file with `verified_at` set. */
  hasVerifiedCard: boolean
  /** Whether the bidder already holds the high bid on this lot. */
  isHighBidder: boolean
}

export type BidGateResult = { ok: true; reason?: undefined } | { ok: false; reason: BidGateReason }

export function canPlaceBid(input: BidGateInput): BidGateResult {
  if (!input.user) return { ok: false, reason: 'signed_out' }
  if (!input.auctionLive) return { ok: false, reason: 'auction_closed' }
  if (!input.hasVerifiedCard) return { ok: false, reason: 'no_card' }
  if (input.isHighBidder) return { ok: false, reason: 'high_bidder' }
  return { ok: true }
}

/**
 * Dollars typed into the custom-bid input -> integer cents, or null when the
 * text is not a positive dollar amount with at most two decimals.
 *
 * Accepts an optional leading `$`, thousands separators, and surrounding
 * whitespace. Rejects anything else (letters, exponents, negatives, more than
 * two decimals, zero) so a typo can never become a bid. The conversion is
 * Math.round(dollars * 100): the input is limited to two decimals, so the
 * product is within a half-cent of an integer and rounding is exact.
 */
export function parseBidDollars(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const cents = Math.round(Number(cleaned) * 100)
  if (!Number.isSafeInteger(cents) || cents <= 0) return null
  return cents
}
