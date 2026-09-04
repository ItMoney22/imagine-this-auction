/**
 * Competitor pricing rows for the homepage comparison table and the pricing
 * page. Single source of truth so both pages show the same numbers.
 *
 * Figures are HiBid's published bidder-platform fees and AuctionFlex 360's
 * published software tiers as of September 2026. HiBid has no flat
 * per-auction fee; its variable cost is the per-unique-bid charge, which is
 * capped per auction, so that cap is stated on the per-bid row rather than
 * as a separate "per auction" row.
 */

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
    hibid: '2% of hammer',
  },
  {
    feature: 'Per-bid fee',
    ita: 'None',
    hibid: '$0.25 per unique bid, capped at $150.00 per auction',
  },
  {
    feature: 'Webcast setup',
    ita: 'None',
    hibid: '$75.00 per auction',
  },
  {
    feature: 'Listing-only fee',
    ita: 'None',
    hibid: '$195.00 per auction',
  },
  {
    feature: 'Monthly software',
    ita: 'None',
    hibid: '$95.00 to $295.00 per month',
  },
]

export const COMPETITOR_CAPTION =
  'HiBid and AuctionFlex 360 published pricing, September 2026'
