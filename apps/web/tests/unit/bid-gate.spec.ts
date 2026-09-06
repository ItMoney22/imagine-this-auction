import { expect, test } from '@playwright/test'

import { canPlaceBid, nextBidCents, parseBidDollars, type BidGateInput } from '../../lib/payments/bid-gate'

const bidder = { id: 'user-1' }

function gate(overrides: Partial<BidGateInput> = {}) {
  return canPlaceBid({
    user: bidder,
    auctionLive: true,
    hasVerifiedCard: true,
    isHighBidder: false,
    ...overrides,
  })
}

/**
 * The bid gate replaces the old wallet-balance check. A bid is allowed only
 * for a signed-in bidder, on a live auction, with a verified card on file,
 * who is not already the high bidder. Money never enters the decision.
 */
test.describe('canPlaceBid', () => {
  test('a signed-in bidder with a verified card on a live auction may bid', () => {
    expect(gate()).toEqual({ ok: true })
  })

  test('signed out is refused first, whatever else is true', () => {
    expect(gate({ user: null })).toEqual({ ok: false, reason: 'signed_out' })
    expect(gate({ user: undefined })).toEqual({ ok: false, reason: 'signed_out' })
    // Nothing else can rescue a signed-out visitor.
    expect(gate({ user: null, auctionLive: false, hasVerifiedCard: false, isHighBidder: true })).toEqual({
      ok: false,
      reason: 'signed_out',
    })
  })

  test('a closed or not-yet-open auction is refused before the card is considered', () => {
    expect(gate({ auctionLive: false })).toEqual({ ok: false, reason: 'auction_closed' })
    // No point sending someone to add a card for an auction they cannot bid on.
    expect(gate({ auctionLive: false, hasVerifiedCard: false })).toEqual({ ok: false, reason: 'auction_closed' })
  })

  test('no verified card is refused with no_card', () => {
    expect(gate({ hasVerifiedCard: false })).toEqual({ ok: false, reason: 'no_card' })
  })

  test('no_card wins over high_bidder: a card is still needed to be charged on a win', () => {
    expect(gate({ hasVerifiedCard: false, isHighBidder: true })).toEqual({ ok: false, reason: 'no_card' })
  })

  test('the current high bidder cannot bid against themselves', () => {
    expect(gate({ isHighBidder: true })).toEqual({ ok: false, reason: 'high_bidder' })
  })

  test('the full matrix has exactly one allowed cell', () => {
    const allowed: string[] = []
    for (const user of [bidder, null]) {
      for (const auctionLive of [true, false]) {
        for (const hasVerifiedCard of [true, false]) {
          for (const isHighBidder of [true, false]) {
            const result = canPlaceBid({ user, auctionLive, hasVerifiedCard, isHighBidder })
            if (result.ok) allowed.push(JSON.stringify({ user, auctionLive, hasVerifiedCard, isHighBidder }))
            else expect(['signed_out', 'auction_closed', 'no_card', 'high_bidder']).toContain(result.reason)
          }
        }
      }
    }
    expect(allowed).toEqual([
      JSON.stringify({ user: bidder, auctionLive: true, hasVerifiedCard: true, isHighBidder: false }),
    ])
  })
})

/**
 * The custom-bid input is typed in dollars ("Min $25.00") and converted to
 * integer cents on submit, so the amount sent to the server is exactly what
 * the bidder typed, never a float.
 */
test.describe('parseBidDollars', () => {
  test('whole and fractional dollars become integer cents', () => {
    expect(parseBidDollars('25')).toBe(2500)
    expect(parseBidDollars('25.5')).toBe(2550)
    expect(parseBidDollars('25.50')).toBe(2550)
    expect(parseBidDollars('0.01')).toBe(1)
  })

  test('rounds the way Math.round(dollars * 100) does, without float drift', () => {
    // 1.15 * 100 is 114.99999999999999 in binary floating point.
    expect(parseBidDollars('1.15')).toBe(115)
    expect(parseBidDollars('19.99')).toBe(1999)
    expect(parseBidDollars('1234.56')).toBe(123456)
  })

  test('tolerates a dollar sign, well-formed thousands separators, and surrounding spaces', () => {
    expect(parseBidDollars('$1,250.00')).toBe(125000)
    expect(parseBidDollars('1,250.50')).toBe(125050)
    expect(parseBidDollars('1,000,000')).toBe(100000000)
    expect(parseBidDollars(' 40 ')).toBe(4000)
    expect(parseBidDollars('$ 12')).toBe(1200)
  })

  test('a comma that is not a thousands separator is a typo, never a decimal point or ignored', () => {
    // "12,50" must not become $1,250.00 (a 100x mistake) by silently dropping the comma.
    expect(parseBidDollars('12,50')).toBeNull()
    expect(parseBidDollars('1,2,3')).toBeNull()
    expect(parseBidDollars('1,00.00')).toBeNull()
    expect(parseBidDollars(',250')).toBeNull()
    expect(parseBidDollars('1,')).toBeNull()
    expect(parseBidDollars('1,2500')).toBeNull()
  })

  test('rejects empty, non-numeric, negative, zero, and sub-cent input', () => {
    expect(parseBidDollars('')).toBeNull()
    expect(parseBidDollars('   ')).toBeNull()
    expect(parseBidDollars('abc')).toBeNull()
    expect(parseBidDollars('12abc')).toBeNull()
    expect(parseBidDollars('-5')).toBeNull()
    expect(parseBidDollars('0')).toBeNull()
    expect(parseBidDollars('0.00')).toBeNull()
    expect(parseBidDollars('1.234')).toBeNull()
    expect(parseBidDollars('1e3')).toBeNull()
    expect(parseBidDollars('.')).toBeNull()
  })
})

/**
 * Opening-bid rule (recorded 2026-09-05): the first bid on a lot is accepted
 * at exactly starting_bid; every later bid needs current high + increment.
 * The panel, the max-bid route, and (Task 4c) place_bid all use this.
 */
test.describe('nextBidCents', () => {
  test('the first bid on a lot is the opening bid itself', () => {
    expect(nextBidCents({ hasBids: false, startingBidCents: 2500, currentHighCents: 0, incrementCents: 500 })).toBe(2500)
  })

  test('a seeded current_high_bid without any bids does not move the opening bid', () => {
    expect(nextBidCents({ hasBids: false, startingBidCents: 2500, currentHighCents: 4000, incrementCents: 500 })).toBe(2500)
    expect(nextBidCents({ hasBids: false, startingBidCents: 2500, currentHighCents: null, incrementCents: 500 })).toBe(2500)
  })

  test('once there are bids the next bid is the high bid plus one increment', () => {
    expect(nextBidCents({ hasBids: true, startingBidCents: 2500, currentHighCents: 2500, incrementCents: 500 })).toBe(3000)
    expect(nextBidCents({ hasBids: true, startingBidCents: 2500, currentHighCents: 9900, incrementCents: 100 })).toBe(10000)
  })

  test('a current high below the opening bid is lifted to the opening bid before the increment', () => {
    expect(nextBidCents({ hasBids: true, startingBidCents: 2500, currentHighCents: 1000, incrementCents: 500 })).toBe(3000)
    expect(nextBidCents({ hasBids: true, startingBidCents: 2500, currentHighCents: null, incrementCents: 500 })).toBe(3000)
  })
})
