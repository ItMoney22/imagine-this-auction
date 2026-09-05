import { expect, test } from '@playwright/test'

import {
  computePremiumCents,
  computeTotalCents,
  formatPremiumPercent,
  formatUsd,
  percentOfCents,
  premiumPercentForAuction,
} from '../../lib/pricing/premium'

/**
 * The premium must round exactly like the SQL that settles the invoice:
 *   ROUND(winning_bid.amount * buyer_premium_percent / 100)
 * so the number a bidder sees before bidding is the number they are charged.
 */
test.describe('buyer premium math', () => {
  test('a whole-cent premium is added as-is', () => {
    // $12.50 hammer at 10% -> $1.25 premium -> $13.75 total
    expect(computePremiumCents(1250, 10)).toBe(125)
    expect(computeTotalCents(1250, 10)).toBe(1375)
  })

  test('a half-cent premium rounds up like SQL ROUND', () => {
    // $12.55 hammer at 10% -> 125.5 cents -> 126 cents
    expect(computePremiumCents(1255, 10)).toBe(126)
    expect(computeTotalCents(1255, 10)).toBe(1381)
  })

  test('a fractional premium rounds to the nearest cent', () => {
    // $99.99 hammer at 12% -> 1199.88 cents -> 1200 cents
    expect(computePremiumCents(9999, 12)).toBe(1200)
    expect(computeTotalCents(9999, 12)).toBe(11199)
  })

  test('a two-decimal percent is applied exactly', () => {
    // $10.00 at 12.5% -> $1.25
    expect(computePremiumCents(1000, 12.5)).toBe(125)
  })

  test('a zero percent premium charges only the hammer', () => {
    expect(computeTotalCents(1250, 0)).toBe(1250)
  })

  test('a zero hammer charges nothing', () => {
    expect(computeTotalCents(0, 10)).toBe(0)
  })

  test('a negative hammer is rejected rather than settled', () => {
    // A bid can never be negative (lots.starting_bid has CHECK > 0), so a
    // negative hammer is a caller bug. Math.round also disagrees with SQL
    // ROUND on negative halves, so there is no correct answer to return.
    expect(() => computePremiumCents(-1250, 10)).toThrow(RangeError)
    expect(() => computeTotalCents(-1250, 10)).toThrow(RangeError)
  })

  /**
   * Regression: hammer * pct in floating point drifts just below a half-cent
   * boundary for some two-decimal percents, so a naive
   * Math.round(hammer * pct / 100) lands one cent under SQL ROUND.
   */
  test('two-decimal percents round like SQL, not like float drift', () => {
    expect(computePremiumCents(1500, 5.1)).toBe(77) // naive float gives 76
    expect(computePremiumCents(2500, 5.02)).toBe(126) // naive float gives 125
    expect(computePremiumCents(25000, 0.29)).toBe(73) // naive float gives 72
  })

  test('agrees with exact half-up rounding for every hammer 0..3000 and every basis point 0..3000', () => {
    // Exact reference: round-half-up of hammer * bp / 10000 in integers.
    // (2*h*bp + 10000) / 20000 with integer division is floor(h*bp/10000 + 0.5).
    // BigInt() calls rather than 2n literals: the tsconfig target predates them.
    const two = BigInt(2)
    const half = BigInt(10000)
    const denominator = BigInt(20000)
    const mismatches: string[] = []
    for (let h = 0; h <= 3000; h++) {
      for (let bp = 0; bp <= 3000; bp++) {
        const exact = Number((two * BigInt(h) * BigInt(bp) + half) / denominator)
        const actual = computePremiumCents(h, bp / 100)
        if (actual !== exact) mismatches.push(`h=${h} bp=${bp}: got ${actual}, want ${exact}`)
      }
    }
    expect(mismatches).toEqual([])
  })
})

test.describe('percentOfCents', () => {
  test('is the same rounding the premium uses, for any fee stated as a percent', () => {
    // $50,000.00 at 1.2% -> $600.00; at 2% -> $1,000.00
    expect(percentOfCents(5_000_000, 1.2)).toBe(60_000)
    expect(percentOfCents(5_000_000, 2)).toBe(100_000)
    expect(percentOfCents(1500, 5.1)).toBe(77)
  })
})

test.describe('premium percent comes from the auction record', () => {
  test('reads auction.buyer_premium_percent', () => {
    expect(premiumPercentForAuction({ buyer_premium_percent: 10 })).toBe(10)
    expect(premiumPercentForAuction({ buyer_premium_percent: 12.5 })).toBe(12.5)
    expect(premiumPercentForAuction({ buyer_premium_percent: 0 })).toBe(0)
  })

  test('accepts a numeric string, which is how DECIMAL(5,2) can arrive', () => {
    expect(premiumPercentForAuction({ buyer_premium_percent: '10.00' })).toBe(10)
    expect(premiumPercentForAuction({ buyer_premium_percent: '12.50' })).toBe(12.5)
  })

  test('a missing or invalid value is null, never a guessed percent', () => {
    // The column is NOT NULL DEFAULT 10.00, so a missing value means the
    // record did not arrive whole. Disclosing 0% would promise a lower total
    // than the invoice; the caller must show "see the auction terms" instead.
    expect(premiumPercentForAuction({ buyer_premium_percent: null })).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: undefined })).toBeNull()
    expect(premiumPercentForAuction({})).toBeNull()
    expect(premiumPercentForAuction(null)).toBeNull()
    expect(premiumPercentForAuction(undefined)).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: 'abc' })).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: '' })).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: '  ' })).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: -5 })).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: Number.NaN })).toBeNull()
    expect(premiumPercentForAuction({ buyer_premium_percent: Number.POSITIVE_INFINITY })).toBeNull()
  })

  test('does not accept a partially numeric string the way parseFloat would', () => {
    expect(premiumPercentForAuction({ buyer_premium_percent: '10abc' })).toBeNull()
  })

  test('the disclosed total uses the auction percent, not a hardcoded 10%', () => {
    const auction = { buyer_premium_percent: 15 }
    const pct = premiumPercentForAuction(auction)
    expect(pct).not.toBeNull()
    // $100.00 hammer at 15% -> $115.00, which a hardcoded 10% would get wrong
    expect(computeTotalCents(10000, pct as number)).toBe(11500)
  })
})

test.describe('formatPremiumPercent', () => {
  test('drops trailing zeros and keeps meaningful decimals', () => {
    expect(formatPremiumPercent(10)).toBe('10%')
    expect(formatPremiumPercent(12.5)).toBe('12.5%')
    expect(formatPremiumPercent(12.25)).toBe('12.25%')
    expect(formatPremiumPercent(0)).toBe('0%')
  })
})

test.describe('formatUsd', () => {
  test('formats cents as US dollars with two decimals', () => {
    expect(formatUsd(1375)).toBe('$13.75')
    expect(formatUsd(11199)).toBe('$111.99')
    expect(formatUsd(123456789)).toBe('$1,234,567.89')
  })

  test('formats zero and nullish as $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(null)).toBe('$0.00')
    expect(formatUsd(undefined)).toBe('$0.00')
  })

  test('rounds a fractional cent before formatting', () => {
    expect(formatUsd(1374.5)).toBe('$13.75')
    expect(formatUsd(1374.4)).toBe('$13.74')
  })

  test('never appends a credit suffix', () => {
    expect(formatUsd(500)).not.toContain('ITC')
    expect(formatUsd(500)).not.toContain('(')
  })
})
