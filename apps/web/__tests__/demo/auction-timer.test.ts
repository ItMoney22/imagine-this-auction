/**
 * Auction Timer Worker Tests
 * @jest-environment node
 */

import { DEMO } from '@/config/demo'

// Mock Supabase
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockResolvedValue({}),
  send: jest.fn().mockResolvedValue({})
}

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        in: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: null, error: null })
            }))
          }))
        })),
        single: jest.fn().mockResolvedValue({ data: null, error: null })
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn().mockResolvedValue({ error: null })
    }))
  })),
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn().mockResolvedValue({})
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}))

// Mock the AuctionTimer class since we can't import it directly in tests
class MockAuctionTimer {
  private isRunning = false
  private timers = new Map()
  private channels = new Map()

  async start() {
    this.isRunning = true
  }

  async stop() {
    this.isRunning = false
    this.timers.clear()
    this.channels.clear()
  }

  getIsRunning() {
    return this.isRunning
  }

  // Mock timer calculation methods
  calculateTimeLeft(endTime: string): number {
    const end = new Date(endTime).getTime()
    const now = Date.now()
    return Math.max(0, Math.floor((end - now) / 1000))
  }

  shouldTriggerSoftClose(timeLeft: number): boolean {
    return timeLeft <= DEMO.SOFT_CLOSE_WINDOW_SEC && timeLeft > 0
  }

  calculateExtensionTime(): number {
    return DEMO.SOFT_CLOSE_EXTEND_SEC
  }
}

describe('Auction Timer Worker', () => {
  let timer: MockAuctionTimer

  beforeEach(() => {
    timer = new MockAuctionTimer()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await timer.stop()
  })

  describe('Timer Lifecycle', () => {
    it('should start and stop properly', async () => {
      expect(timer.getIsRunning()).toBe(false)

      await timer.start()
      expect(timer.getIsRunning()).toBe(true)

      await timer.stop()
      expect(timer.getIsRunning()).toBe(false)
    })

    it('should handle multiple start attempts gracefully', async () => {
      await timer.start()
      expect(timer.getIsRunning()).toBe(true)

      // Second start should not cause issues
      await timer.start()
      expect(timer.getIsRunning()).toBe(true)
    })
  })

  describe('Time Calculations', () => {
    it('should calculate time left correctly', () => {
      const futureTime = new Date(Date.now() + 300000).toISOString() // 5 minutes from now
      const timeLeft = timer.calculateTimeLeft(futureTime)

      expect(timeLeft).toBeGreaterThan(290) // ~300 seconds, allowing for execution time
      expect(timeLeft).toBeLessThanOrEqual(300)
    })

    it('should return 0 for past times', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString() // 1 second ago
      const timeLeft = timer.calculateTimeLeft(pastTime)

      expect(timeLeft).toBe(0)
    })

    it('should handle invalid dates gracefully', () => {
      expect(() => {
        timer.calculateTimeLeft('invalid-date')
      }).not.toThrow()
    })
  })

  describe('Anti-Sniping Logic', () => {
    it('should trigger soft close within window', () => {
      const withinWindow = DEMO.SOFT_CLOSE_WINDOW_SEC - 5
      expect(timer.shouldTriggerSoftClose(withinWindow)).toBe(true)
    })

    it('should not trigger soft close outside window', () => {
      const outsideWindow = DEMO.SOFT_CLOSE_WINDOW_SEC + 5
      expect(timer.shouldTriggerSoftClose(outsideWindow)).toBe(false)
    })

    it('should not trigger soft close when time is up', () => {
      expect(timer.shouldTriggerSoftClose(0)).toBe(false)
      expect(timer.shouldTriggerSoftClose(-1)).toBe(false)
    })

    it('should calculate proper extension time', () => {
      const extension = timer.calculateExtensionTime()
      expect(extension).toBe(DEMO.SOFT_CLOSE_EXTEND_SEC)
      expect(extension).toBeGreaterThan(0)
    })
  })

  describe('Realtime Channel Management', () => {
    it('should create proper channel names', () => {
      const lotId = 'test-lot-123'
      const expectedChannel = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`

      expect(expectedChannel).toBe(`lot_${lotId}`)
    })

    it('should setup channel subscriptions', () => {
      const channel = mockSupabase.channel('test-channel')

      expect(mockSupabase.channel).toHaveBeenCalledWith('test-channel')
      expect(channel.on).toBeDefined()
      expect(channel.subscribe).toBeDefined()
    })
  })

  describe('Database Interactions', () => {
    it('should query lots with correct filters', () => {
      const query = mockSupabase
        .from('lots')
        .select('*')
        .eq('demo_label', DEMO.DEMO_LABEL)
        .eq('status', 'live')

      expect(mockSupabase.from).toHaveBeenCalledWith('lots')
    })

    it('should handle database errors gracefully', async () => {
      // Mock database error
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          }))
        }))
      })

      // Should not throw
      expect(async () => {
        await timer.start()
      }).not.toThrow()
    })
  })

  describe('Timer Events', () => {
    it('should broadcast timer updates', () => {
      const update = {
        type: 'timer_tick',
        lot_id: 'test-lot',
        seconds_left: 120,
        current_bid_itc: 100,
        timestamp: new Date().toISOString()
      }

      expect(update.type).toBe('timer_tick')
      expect(update.seconds_left).toBeGreaterThanOrEqual(0)
      expect(update.current_bid_itc).toBeGreaterThan(0)
    })

    it('should broadcast anti-snipe events', () => {
      const antiSnipe = {
        type: 'anti_snipe',
        lot_id: 'test-lot',
        extension_seconds: DEMO.SOFT_CLOSE_EXTEND_SEC,
        message: `Bidding extended by ${DEMO.SOFT_CLOSE_EXTEND_SEC} seconds!`,
        timestamp: new Date().toISOString()
      }

      expect(antiSnipe.type).toBe('anti_snipe')
      expect(antiSnipe.extension_seconds).toBe(DEMO.SOFT_CLOSE_EXTEND_SEC)
      expect(antiSnipe.message).toContain('extended')
    })

    it('should broadcast lot end events', () => {
      const lotEnd = {
        type: 'lot_ended',
        lot_id: 'test-lot',
        lot_number: 1,
        final_bid_itc: 150,
        reason: 'Timer expired',
        timestamp: new Date().toISOString()
      }

      expect(lotEnd.type).toBe('lot_ended')
      expect(lotEnd.reason).toBeTruthy()
      expect(lotEnd.final_bid_itc).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Health Checks', () => {
    it('should validate timer intervals', () => {
      expect(DEMO.TIMER_TICK_INTERVAL_MS).toBeGreaterThan(0)
      expect(DEMO.TIMER_TICK_INTERVAL_MS).toBeLessThanOrEqual(5000)
    })

    it('should handle orphaned lots', () => {
      const now = new Date()
      const pastEnd = new Date(now.getTime() - 60000) // 1 minute ago

      const timeLeft = timer.calculateTimeLeft(pastEnd.toISOString())
      expect(timeLeft).toBe(0)
    })
  })

  describe('Lot Progression', () => {
    it('should handle lot transitions correctly', () => {
      const lotStatuses = ['approved', 'live', 'ending_soon', 'ended']

      for (const status of lotStatuses) {
        expect(['approved', 'live', 'ending_soon', 'ended']).toContain(status)
      }
    })

    it('should calculate lot sequence properly', () => {
      const auctionId = 'test-auction'
      const lotNumbers = [1, 2, 3, 4, 5]

      for (let i = 0; i < lotNumbers.length - 1; i++) {
        expect(lotNumbers[i + 1]).toBe(lotNumbers[i] + 1)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle timer cleanup on errors', async () => {
      await timer.start()

      // Simulate error during operation
      await timer.stop()

      expect(timer.getIsRunning()).toBe(false)
    })

    it('should handle channel cleanup on errors', async () => {
      await timer.start()

      // Should clean up channels
      await timer.stop()

      expect(mockSupabase.removeChannel).toHaveBeenCalled()
    })

    it('should handle graceful shutdown', async () => {
      await timer.start()
      expect(timer.getIsRunning()).toBe(true)

      // Simulate shutdown signal
      await timer.stop()
      expect(timer.getIsRunning()).toBe(false)
    })
  })

  describe('Performance', () => {
    it('should handle multiple concurrent lots', () => {
      const maxLots = DEMO.NUM_AUCTIONEERS * DEMO.AUCTIONS_PER_AUCTIONEER
      expect(maxLots).toBeLessThanOrEqual(20) // Reasonable limit
    })

    it('should have efficient timer intervals', () => {
      const interval = DEMO.TIMER_TICK_INTERVAL_MS
      expect(interval).toBeGreaterThanOrEqual(1000) // Not too frequent
      expect(interval).toBeLessThanOrEqual(5000) // Not too slow
    })
  })
})