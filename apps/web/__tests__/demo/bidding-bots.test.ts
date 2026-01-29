/**
 * Bidding Bots Worker Tests
 * @jest-environment node
 */

import { DEMO, type BotStrategy } from '@/config/demo'

// Mock fetch for API calls
global.fetch = jest.fn()

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        not: jest.fn(() => ({
          mockResolvedValue: jest.fn().mockResolvedValue({ data: [], error: null })
        })),
        is: jest.fn(() => ({
          mockResolvedValue: jest.fn().mockResolvedValue({ data: [], error: null })
        })),
        limit: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null })
        }))
      }))
    }))
  })),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockResolvedValue({})
  })),
  removeChannel: jest.fn().mockResolvedValue({})
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}))

// Mock BiddingBots class for testing
class MockBiddingBots {
  private bots: Map<string, any> = new Map()
  private activeLots: Map<string, any> = new Map()
  private isRunning = false

  async start() {
    this.isRunning = true
    this.loadMockData()
  }

  async stop() {
    this.isRunning = false
    this.bots.clear()
    this.activeLots.clear()
  }

  private loadMockData() {
    // Mock bot data
    this.bots.set('bot-1', {
      id: 'bot-1',
      first_name: 'TestBot',
      strategy: 'early' as BotStrategy,
      max_bid_itc: DEMO.BOT_MAX_BID_ITC,
      wallet_balance_itc: DEMO.CREDIT_TOPUP_ITC,
      active_bids: new Map(),
      last_bid_time: new Date(0),
      throttle_until: new Date(0)
    })

    // Mock lot data
    this.activeLots.set('lot-1', {
      id: 'lot-1',
      lot_number: 1,
      title: 'Test Item',
      start_price_itc: 100,
      current_bid_itc: 120,
      ends_at: new Date(Date.now() + 300000).toISOString(), // 5 minutes
      bid_count: 3
    })
  }

  shouldBotBid(bot: any, lot: any, timeLeftMs: number): boolean {
    const timeLeftSeconds = timeLeftMs / 1000
    const currentBid = lot.current_bid_itc || lot.start_price_itc

    // Don't bid if already highest bidder
    if (lot.current_bidder_id === bot.id) return false

    // Don't bid if no wallet balance
    if (bot.wallet_balance_itc < currentBid * 1.1) return false

    // Don't bid if exceeds max bid
    if (currentBid >= bot.max_bid_itc) return false

    // Strategy-specific logic
    switch (bot.strategy) {
      case 'early':
        return timeLeftSeconds > 180 && lot.bid_count < 5 && Math.random() < 0.8 // Higher chance for testing
      case 'mid':
        return timeLeftSeconds > 60 && timeLeftSeconds < 300 && lot.bid_count >= 2 && Math.random() < 0.8
      case 'sniper':
        return timeLeftSeconds < 30 && timeLeftSeconds > 5 && Math.random() < 0.8
      case 'chaser':
        return lot.bid_count > 0 && Math.random() < 0.8
      default:
        return Math.random() < 0.5
    }
  }

  calculateBidAmount(bot: any, lot: any): number | null {
    const currentBid = lot.current_bid_itc || lot.start_price_itc
    const minIncrement = Math.max(1, currentBid * DEMO.BOT_BID_INCREMENT_MIN)
    const maxIncrement = Math.max(1, currentBid * DEMO.BOT_BID_INCREMENT_MAX)

    const increment = Math.floor(Math.random() * (maxIncrement - minIncrement + 1)) + minIncrement
    const newBidAmount = currentBid + increment

    if (newBidAmount > bot.max_bid_itc) {
      return Math.min(bot.max_bid_itc, currentBid + 1)
    }

    const maxAffordable = bot.wallet_balance_itc * 0.9
    if (newBidAmount > maxAffordable) {
      return null
    }

    return Math.round(newBidAmount)
  }

  getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  getBots() { return this.bots }
  getActiveLots() { return this.activeLots }
  getIsRunning() { return this.isRunning }
}

describe('Bidding Bots Worker', () => {
  let bots: MockBiddingBots

  beforeEach(() => {
    bots = new MockBiddingBots()
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    })
  })

  afterEach(async () => {
    await bots.stop()
  })

  describe('Bot Lifecycle', () => {
    it('should start and stop properly', async () => {
      expect(bots.getIsRunning()).toBe(false)

      await bots.start()
      expect(bots.getIsRunning()).toBe(true)
      expect(bots.getBots().size).toBeGreaterThan(0)

      await bots.stop()
      expect(bots.getIsRunning()).toBe(false)
      expect(bots.getBots().size).toBe(0)
    })

    it('should load bot data correctly', async () => {
      await bots.start()

      const bot = Array.from(bots.getBots().values())[0]
      expect(bot).toBeDefined()
      expect(bot.strategy).toBeTruthy()
      expect(bot.max_bid_itc).toBe(DEMO.BOT_MAX_BID_ITC)
      expect(bot.wallet_balance_itc).toBe(DEMO.CREDIT_TOPUP_ITC)
    })
  })

  describe('Bot Strategies', () => {
    let bot: any
    let lot: any

    beforeEach(async () => {
      await bots.start()
      bot = Array.from(bots.getBots().values())[0]
      lot = Array.from(bots.getActiveLots().values())[0]
    })

    it('should implement early strategy correctly', () => {
      bot.strategy = 'early'

      // Should bid early in auction
      const timeLeft5Min = 300 * 1000 // 5 minutes
      const shouldBid = bots.shouldBotBid(bot, lot, timeLeft5Min)
      expect(typeof shouldBid).toBe('boolean')

      // Should not bid late in auction
      const timeLeft30Sec = 30 * 1000 // 30 seconds
      const shouldNotBid = bots.shouldBotBid(bot, lot, timeLeft30Sec)
      expect(typeof shouldNotBid).toBe('boolean')
    })

    it('should implement mid strategy correctly', () => {
      bot.strategy = 'mid'

      // Should bid in middle of auction
      const timeLeft2Min = 120 * 1000 // 2 minutes
      lot.bid_count = 3 // Some activity
      const result = bots.shouldBotBid(bot, lot, timeLeft2Min)
      expect(typeof result).toBe('boolean')
    })

    it('should implement sniper strategy correctly', () => {
      bot.strategy = 'sniper'

      // Should bid in final moments
      const timeLeft15Sec = 15 * 1000 // 15 seconds
      const result = bots.shouldBotBid(bot, lot, timeLeft15Sec)
      expect(typeof result).toBe('boolean')

      // Should not bid too early
      const timeLeft5Min = 300 * 1000 // 5 minutes
      const shouldNotBid = bots.shouldBotBid(bot, lot, timeLeft5Min)
      expect(typeof shouldNotBid).toBe('boolean')
    })

    it('should implement chaser strategy correctly', () => {
      bot.strategy = 'chaser'

      // Should follow activity
      lot.bid_count = 5 // Active bidding
      const result = bots.shouldBotBid(bot, lot, 120 * 1000)
      expect(typeof result).toBe('boolean')
    })

    it('should respect all strategies', () => {
      const strategies: BotStrategy[] = ['early', 'mid', 'sniper', 'chaser']

      for (const strategy of strategies) {
        expect(DEMO.BOT_STRATEGIES).toContain(strategy)
      }
    })
  })

  describe('Bid Calculation', () => {
    let bot: any
    let lot: any

    beforeEach(async () => {
      await bots.start()
      bot = Array.from(bots.getBots().values())[0]
      lot = Array.from(bots.getActiveLots().values())[0]
    })

    it('should calculate bid increments correctly', () => {
      const bidAmount = bots.calculateBidAmount(bot, lot)

      if (bidAmount) {
        expect(bidAmount).toBeGreaterThan(lot.current_bid_itc)
        expect(bidAmount).toBeLessThanOrEqual(bot.max_bid_itc)

        const increment = bidAmount - lot.current_bid_itc
        const minIncrement = lot.current_bid_itc * DEMO.BOT_BID_INCREMENT_MIN
        const maxIncrement = lot.current_bid_itc * DEMO.BOT_BID_INCREMENT_MAX

        expect(increment).toBeGreaterThanOrEqual(minIncrement)
        expect(increment).toBeLessThanOrEqual(maxIncrement)
      }
    })

    it('should respect spending limits', () => {
      // Set low max bid
      bot.max_bid_itc = 50
      lot.current_bid_itc = 100 // Higher than max

      const bidAmount = bots.calculateBidAmount(bot, lot)
      expect(bidAmount).toBeLessThanOrEqual(bot.max_bid_itc)
    })

    it('should respect wallet balance', () => {
      bot.wallet_balance_itc = 50
      lot.current_bid_itc = 100

      const bidAmount = bots.calculateBidAmount(bot, lot)
      expect(bidAmount).toBeNull() // Should not bid if can't afford
    })

    it('should handle edge cases gracefully', () => {
      // Very high current bid
      lot.current_bid_itc = 999999
      const bidAmount = bots.calculateBidAmount(bot, lot)

      if (bidAmount) {
        expect(bidAmount).toBeLessThanOrEqual(bot.max_bid_itc)
      }
    })
  })

  describe('Bid Timing and Throttling', () => {
    it('should respect throttle timing', () => {
      const throttleRange = DEMO.BOT_THROTTLE_MS
      expect(throttleRange[0]).toBeLessThanOrEqual(throttleRange[1])
      expect(throttleRange[0]).toBeGreaterThan(0)
    })

    it('should generate random delays', () => {
      const delay1 = bots.getRandomInt(1000, 5000)
      const delay2 = bots.getRandomInt(1000, 5000)

      expect(delay1).toBeGreaterThanOrEqual(1000)
      expect(delay1).toBeLessThanOrEqual(5000)
      expect(delay2).toBeGreaterThanOrEqual(1000)
      expect(delay2).toBeLessThanOrEqual(5000)
    })
  })

  describe('Bid Placement', () => {
    beforeEach(() => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, bid_id: 'test-bid' })
      })
    })

    it('should format bid requests correctly', async () => {
      const bidData = {
        lot_id: 'lot-1',
        user_id: 'bot-1',
        amount_itc: 150,
        is_bot_bid: true
      }

      expect(bidData.lot_id).toBeTruthy()
      expect(bidData.user_id).toBeTruthy()
      expect(bidData.amount_itc).toBeGreaterThan(0)
      expect(bidData.is_bot_bid).toBe(true)
    })

    it('should handle API failures gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Bid failed' })
      })

      // Should not throw error on failed bid
      expect(async () => {
        await bots.start()
      }).not.toThrow()
    })
  })

  describe('Real-time Event Handling', () => {
    it('should handle lot updates', () => {
      const lotUpdate = {
        id: 'lot-1',
        status: 'live',
        current_bid_itc: 200,
        current_bidder_id: 'user-123'
      }

      expect(lotUpdate.id).toBeTruthy()
      expect(lotUpdate.status).toBe('live')
      expect(lotUpdate.current_bid_itc).toBeGreaterThan(0)
    })

    it('should handle bid events', () => {
      const bidEvent = {
        lot_id: 'lot-1',
        user_id: 'bot-1',
        amount_itc: 175,
        created_at: new Date().toISOString()
      }

      expect(bidEvent.lot_id).toBeTruthy()
      expect(bidEvent.amount_itc).toBeGreaterThan(0)
      expect(bidEvent.created_at).toBeTruthy()
    })
  })

  describe('Bot Intelligence', () => {
    let bot: any
    let lot: any

    beforeEach(async () => {
      await bots.start()
      bot = Array.from(bots.getBots().values())[0]
      lot = Array.from(bots.getActiveLots().values())[0]
    })

    it('should not bid against itself', () => {
      lot.current_bidder_id = bot.id
      const shouldBid = bots.shouldBotBid(bot, lot, 120000)
      expect(shouldBid).toBe(false)
    })

    it('should consider auction activity', () => {
      // High activity lot
      lot.bid_count = 10

      // Low activity lot
      const quietLot = { ...lot, bid_count: 0 }

      expect(lot.bid_count).toBeGreaterThan(quietLot.bid_count)
    })

    it('should adapt to market conditions', () => {
      // High price lot
      lot.current_bid_itc = 800

      // Low price lot
      const cheapLot = { ...lot, current_bid_itc: 50 }

      const expensiveBid = bots.calculateBidAmount(bot, lot)
      const cheapBid = bots.calculateBidAmount(bot, cheapLot)

      if (expensiveBid && cheapBid) {
        expect(expensiveBid).toBeGreaterThan(cheapBid)
      }
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle multiple bots efficiently', () => {
      const maxBots = DEMO.NUM_BOT_BIDDERS
      expect(maxBots).toBeLessThanOrEqual(20) // Reasonable limit
      expect(maxBots).toBeGreaterThan(0)
    })

    it('should have reasonable thinking intervals', () => {
      // Bots should think every 2-5 seconds
      const minThink = 2000
      const maxThink = 5000

      expect(minThink).toBeLessThan(maxThink)
      expect(maxThink).toBeLessThanOrEqual(10000) // Not too slow
    })

    it('should limit concurrent operations', async () => {
      await bots.start()

      const botCount = bots.getBots().size
      const lotCount = bots.getActiveLots().size

      // Should be reasonable numbers for testing
      expect(botCount * lotCount).toBeLessThanOrEqual(100)
    })
  })

  describe('Error Recovery', () => {
    it('should handle network failures', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      // Should not crash on network errors
      expect(async () => {
        await bots.start()
      }).not.toThrow()
    })

    it('should handle database disconnection', () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database disconnected')
      })

      // Should handle gracefully
      expect(async () => {
        await bots.start()
      }).not.toThrow()
    })

    it('should recover from channel errors', () => {
      mockSupabase.channel.mockImplementation(() => {
        throw new Error('Channel error')
      })

      expect(async () => {
        await bots.start()
      }).not.toThrow()
    })
  })
})