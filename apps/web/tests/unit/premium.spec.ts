import { expect, test } from '@playwright/test'

import {
  computePremiumCents,
  computeTotalCents,
  formatUsd,
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

  test('a zero percent premium charges only the hammer', () => {
    expect(computeTotalCents(1250, 0)).toBe(1250)
  })

  test('a zero hammer charges nothing', () => {
    expect(computeTotalCents(0, 10)).toBe(0)
  })
})

test.describe('premium percent comes from the auction record', () => {
  test('reads auction.buyer_premium_percent', () => {
    expect(premiumPercentForAuction({ buyer_premium_percent: 10 })).toBe(10)
    expect(premiumPercentForAuction({ buyer_premium_percent: 12.5 })).toBe(12.5)
  })

  test('accepts a numeric string, which is how DECIMAL(5,2) can arrive', () => {
    expect(premiumPercentForAuction({ buyer_premium_percent: '10.00' })).toBe(10)
  })

  test('a missing or invalid value is treated as no premium rather than guessed', () => {
    expect(premiumPercentForAuction({ buyer_premium_percent: null })).toBe(0)
    expect(premiumPercentForAuction({})).toBe(0)
    expect(premiumPercentForAuction(null)).toBe(0)
    expect(premiumPercentForAuction({ buyer_premium_percent: 'abc' })).toBe(0)
  })

  test('the disclosed total uses the auction percent, not a hardcoded 10%', () => {
    const auction = { buyer_premium_percent: 15 }
    const pct = premiumPercentForAuction(auction)
    // $100.00 hammer at 15% -> $115.00, which a hardcoded 10% would get wrong
    expect(computeTotalCents(10000, pct)).toBe(11500)
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

  test('never appends a credit suffix', () => {
    expect(formatUsd(500)).not.toContain('ITC')
    expect(formatUsd(500)).not.toContain('(')
  })
})
