/**
 * Platform and competitor pricing for the homepage comparison table, the
 * savings examples, and the pricing page. Single source of truth so every
 * surface shows the same numbers and none of them can drift.
 *
 * No competitor is named anywhere in here, and none should be added. The
 * figures are the published rate cards of the established online auction
 * platforms and of the live shopping apps as of September 2026, stated as the
 * range each category charges. Naming a rival on our own pricing page starts a
 * fee-by-fee argument we do not want, and it dates the page the day they
 * reprice. The category and the date are enough for a reader to check us.
 *
 * Two lanes, because we compete in two markets at once: timed and webcast
 * auctions against the auction platforms, and live shopping against the apps.
 *
 * Money is integer cents end to end and only formatted at the edge.
 */

import { formatUsd, percentOfCents } from './premium'

/** Imagine This Auction's own platform commission, percent of hammer. */
export const ITA_PRICING = {
  /** Founding auctioneers' rate, locked for as long as they sell here. */
  foundingCommissionPct: 1.2,
  /** The rate for auctioneers who join after the founding window. */
  standardCommissionPct: 2,
} as const

/**
 * What the established online auction platforms publish, September 2026. The
 * commission range spans the category: the cheapest charges 2% of hammer, the
 * dearest 5%. Every worked example below uses the 2% end, so the gap we claim
 * is the smallest true one.
 */
export const AUCTION_PLATFORM_PRICING = {
  commissionMinPct: 2,
  commissionMaxPct: 5,
  perBidFeeCents: 25,
  perBidCapCents: 15_000,
  webcastSetupCents: 7_500,
  listingOnlyCents: 19_500,
  softwareMinCents: 9_500,
  /** Middle software tier; the worked savings example assumes it. */
  softwareMidCents: 14_500,
  softwareMaxCents: 29_500,
  /** Not shown anywhere; see the note on card processing below. */
  processingPct: 3.99,
  processingFixedCents: 25,
} as const

/**
 * What the live shopping apps take from a seller, September 2026. The
 * commission is the standard rate; a few categories are lower. Processing is
 * charged by the app on top, on the whole order.
 */
export const LIVE_SHOPPING_PRICING = {
  commissionPct: 8,
  /** Not shown anywhere; see the note on card processing below. */
  processingPct: 2.9,
  processingFixedCents: 30,
} as const

/**
 * Card processing is deliberately absent from the table and from both worked
 * examples, on every side.
 *
 * Processing here runs through us, at a rate within a rounding error of what
 * the live shopping apps charge. Putting it in a comparison would either be a
 * wash or, worse, read as a claim we cannot defend fee-by-fee. Commission and
 * the fees that only they charge are the honest ground, so that is the only
 * ground the comparison stands on. The competitor processing figures above are
 * kept for reference; do not surface them without surfacing ours beside them.
 */

// ============================================================
// Fee comparison table
// ============================================================

/** Column headings for the two competitor lanes, in table order. */
export const COMPETITOR_COLUMNS = ['Online auction platforms', 'Live shopping apps'] as const

export interface CompetitorRow {
  /** What is being compared. */
  feature: string
  /** Imagine This Auction's terms. */
  ita: string
  /** One entry per COMPETITOR_COLUMNS, in the same order. */
  competitors: readonly [string, string]
}

export const COMPETITOR_ROWS: ReadonlyArray<CompetitorRow> = [
  {
    feature: 'Platform commission',
    ita: `${ITA_PRICING.foundingCommissionPct}% of hammer, founding rate locked for life`,
    competitors: [
      `${AUCTION_PLATFORM_PRICING.commissionMinPct}% to ${AUCTION_PLATFORM_PRICING.commissionMaxPct}% of hammer`,
      `${LIVE_SHOPPING_PRICING.commissionPct}% of the sale price`,
    ],
  },
  {
    feature: 'Per-bid fee',
    ita: 'None',
    competitors: [
      `${formatUsd(AUCTION_PLATFORM_PRICING.perBidFeeCents)} per unique bid, capped at ${formatUsd(AUCTION_PLATFORM_PRICING.perBidCapCents)} per auction`,
      'None',
    ],
  },
  {
    feature: 'Live video setup',
    ita: 'None',
    competitors: [`${formatUsd(AUCTION_PLATFORM_PRICING.webcastSetupCents)} per auction`, 'None'],
  },
  {
    feature: 'Listing fee',
    ita: 'None',
    competitors: [`${formatUsd(AUCTION_PLATFORM_PRICING.listingOnlyCents)} per auction`, 'None'],
  },
  {
    feature: 'Monthly software',
    ita: 'None',
    competitors: [
      `${formatUsd(AUCTION_PLATFORM_PRICING.softwareMinCents)} to ${formatUsd(AUCTION_PLATFORM_PRICING.softwareMaxCents)} per month`,
      'None',
    ],
  },
  {
    feature: 'Who holds the money',
    ita: 'Settles straight to your own bank. We never hold your buyers’ money.',
    competitors: [
      'Varies. Some settle to you, some hold and pay out on a schedule.',
      'The app holds the money and pays out on its own schedule',
    ],
  },
]

export const COMPETITOR_CAPTION =
  'Published rate cards of the established online auction platforms and live shopping apps, September 2026'

// ============================================================
// Worked savings examples
// ============================================================

/**
 * Every input to both examples. The small print under each one states these,
 * and the totals are derived from them, never typed by hand.
 */
export const SAVINGS_EXAMPLE = {
  /** Hammer, or sale price on a live shopping app, per month. */
  monthlyHammerCents: 5_000_000,
  auctionsPerMonth: 4,
  /** The premium the auctioneer sets and keeps. Named in the small print, never counted as a saving. */
  buyerPremiumPct: 10,
  /** Auctions per month assumed to reach the per-bid cap. */
  bidCapAuctions: 2,
} as const

export interface SavingsLine {
  label: string
  cents: number
  /** True when this line is one of ours and costs nothing. */
  free?: boolean
}

export interface SavingsComparison {
  key: 'auction-platforms' | 'live-shopping'
  /** Heading over the rival column, e.g. "On an auction platform". */
  rivalLabel: string
  /** One sentence on what this comparison is. */
  summary: string
  rivalLines: ReadonlyArray<SavingsLine>
  itaLines: ReadonlyArray<SavingsLine>
  rivalTotalCents: number
  itaTotalCents: number
  monthlySavingsCents: number
  yearlySavingsCents: number
  /** The assumptions behind it, as small print. */
  note: string
}

const hammer = SAVINGS_EXAMPLE.monthlyHammerCents
const itaCommissionCents = percentOfCents(hammer, ITA_PRICING.foundingCommissionPct)

// --- Lane 1: the auction platforms. Platform fees only. -------------------
// Card processing is left out of both sides here: on the cheapest of these
// platforms the auctioneer already brings their own merchant account, exactly
// as they do here, so counting it twice would flatter us.

const platformCommissionCents = percentOfCents(hammer, AUCTION_PLATFORM_PRICING.commissionMinPct)
const platformWebcastCents = SAVINGS_EXAMPLE.auctionsPerMonth * AUCTION_PLATFORM_PRICING.webcastSetupCents
const platformBidFeesCents = SAVINGS_EXAMPLE.bidCapAuctions * AUCTION_PLATFORM_PRICING.perBidCapCents
const platformTotalCents =
  platformCommissionCents + AUCTION_PLATFORM_PRICING.softwareMidCents + platformWebcastCents + platformBidFeesCents

const auctionPlatformComparison: SavingsComparison = {
  key: 'auction-platforms',
  rivalLabel: 'On an auction platform',
  summary: 'Timed and webcast auctions, platform fees only.',
  rivalLines: [
    {
      label: `${AUCTION_PLATFORM_PRICING.commissionMinPct}% commission on ${formatUsd(hammer)}`,
      cents: platformCommissionCents,
    },
    { label: 'Software, mid tier', cents: AUCTION_PLATFORM_PRICING.softwareMidCents },
    { label: `Live video setup, ${SAVINGS_EXAMPLE.auctionsPerMonth} auctions`, cents: platformWebcastCents },
    { label: `Per-bid fees, cap hit ${SAVINGS_EXAMPLE.bidCapAuctions} times`, cents: platformBidFeesCents },
  ],
  itaLines: [
    { label: `${ITA_PRICING.foundingCommissionPct}% founding rate on ${formatUsd(hammer)}`, cents: itaCommissionCents },
    { label: 'Software', cents: 0, free: true },
    { label: 'Live video setup', cents: 0, free: true },
    { label: 'Per-bid and listing fees', cents: 0, free: true },
  ],
  rivalTotalCents: platformTotalCents,
  itaTotalCents: itaCommissionCents,
  monthlySavingsCents: platformTotalCents - itaCommissionCents,
  yearlySavingsCents: (platformTotalCents - itaCommissionCents) * 12,
  note:
    `${formatUsd(hammer)} in hammer a month across ${SAVINGS_EXAMPLE.auctionsPerMonth} auctions. ` +
    `The auction platform at the cheapest published commission in the category, ${AUCTION_PLATFORM_PRICING.commissionMinPct}% ` +
    `(the range runs to ${AUCTION_PLATFORM_PRICING.commissionMaxPct}%), a middle software tier at ` +
    `${formatUsd(AUCTION_PLATFORM_PRICING.softwareMidCents)} a month, ${formatUsd(AUCTION_PLATFORM_PRICING.webcastSetupCents)} ` +
    `of webcast setup per auction, and the ${formatUsd(AUCTION_PLATFORM_PRICING.perBidFeeCents)} per unique bid fee reaching its ` +
    `${formatUsd(AUCTION_PLATFORM_PRICING.perBidCapCents)} cap in ${SAVINGS_EXAMPLE.bidCapAuctions} of the ` +
    `${SAVINGS_EXAMPLE.auctionsPerMonth}. Card processing is comparable on both sides and is left out of both.`,
}

// --- Lane 2: the live shopping apps. Commission only. ---------------------
// Their 8% and our 1.2% are the whole comparison. Processing sits outside it on
// both sides, for the reason recorded above, and the buyer's premium you keep
// here is not counted as a saving even though the app model never pays it.

const liveCommissionCents = percentOfCents(hammer, LIVE_SHOPPING_PRICING.commissionPct)

const liveShoppingComparison: SavingsComparison = {
  key: 'live-shopping',
  rivalLabel: 'On a live shopping app',
  summary: 'Live selling, commission on every sale.',
  rivalLines: [
    { label: `${LIVE_SHOPPING_PRICING.commissionPct}% commission on ${formatUsd(hammer)}`, cents: liveCommissionCents },
    { label: 'Streaming and listing', cents: 0, free: true },
  ],
  itaLines: [
    { label: `${ITA_PRICING.foundingCommissionPct}% founding rate on ${formatUsd(hammer)}`, cents: itaCommissionCents },
    { label: 'Streaming and listing', cents: 0, free: true },
  ],
  rivalTotalCents: liveCommissionCents,
  itaTotalCents: itaCommissionCents,
  monthlySavingsCents: liveCommissionCents - itaCommissionCents,
  yearlySavingsCents: (liveCommissionCents - itaCommissionCents) * 12,
  note:
    `${formatUsd(hammer)} of sales a month. The app at its standard ${LIVE_SHOPPING_PRICING.commissionPct}% commission, ` +
    `us at the ${ITA_PRICING.foundingCommissionPct}% founding rate. Card processing is comparable on both sides and is ` +
    `left out of both. The ${SAVINGS_EXAMPLE.buyerPremiumPct}% buyer's premium you set here is yours to keep and is not ` +
    `counted as a saving.`,
}

export const SAVINGS_COMPARISONS: ReadonlyArray<SavingsComparison> = [
  auctionPlatformComparison,
  liveShoppingComparison,
]

/** The smaller of the two monthly gaps, for headline copy that must be true of both. */
export const SMALLEST_MONTHLY_SAVINGS_CENTS = Math.min(
  ...SAVINGS_COMPARISONS.map((comparison) => comparison.monthlySavingsCents)
)
