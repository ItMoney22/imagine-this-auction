/**
 * Competitor pricing for the homepage comparison table, the savings example,
 * and the pricing page. Single source of truth so every surface shows the
 * same numbers and none of them can drift.
 *
 * Figures are HiBid's published bidder-platform fees and AuctionFlex 360's
 * published software tiers as of September 2026. HiBid has no flat
 * per-auction fee; its variable cost is the per-unique-bid charge, which is
 * capped per auction, so that cap is stated on the per-bid row rather than
 * as a separate "per auction" row.
 */

import { formatUsd } from './premium'

/** HiBid / AuctionFlex 360 published figures. Money in integer cents. */
export const HIBID_PRICING = {
  commissionPct: 2,
  perBidFeeCents: 25,
  perBidCapCents: 15_000,
  webcastSetupCents: 7_500,
  listingOnlyCents: 19_500,
  softwareMinCents: 9_500,
  /** AuctionFlex 360 middle tier; the worked savings example assumes it. */
  softwareMidCents: 14_500,
  softwareMaxCents: 29_500,
} as const

export interface CompetitorRow {
  /** What is being compared. */
  feature: string
  /** ImagineThis Auction's terms. */
  ita: string
  /** HiBid / AuctionFlex 360's published terms. */
  hibid: string
}

export const COMPETITOR_ROWS: CompetitorRow[] = [
  {
    feature: 'Platform commission',
    ita: '1.2% of hammer, founding rate locked for life',
    hibid: `${HIBID_PRICING.commissionPct}% of hammer`,
  },
  {
    feature: 'Per-bid fee',
    ita: 'None',
    hibid: `${formatUsd(HIBID_PRICING.perBidFeeCents)} per unique bid, capped at ${formatUsd(HIBID_PRICING.perBidCapCents)} per auction`,
  },
  {
    feature: 'Webcast setup',
    ita: 'None',
    hibid: `${formatUsd(HIBID_PRICING.webcastSetupCents)} per auction`,
  },
  {
    feature: 'Listing-only fee',
    ita: 'None',
    hibid: `${formatUsd(HIBID_PRICING.listingOnlyCents)} per auction`,
  },
  {
    feature: 'Monthly software',
    ita: 'None',
    hibid: `${formatUsd(HIBID_PRICING.softwareMinCents)} to ${formatUsd(HIBID_PRICING.softwareMaxCents)} per month`,
  },
]

export const COMPETITOR_CAPTION =
  'HiBid and AuctionFlex 360 published pricing, September 2026'
