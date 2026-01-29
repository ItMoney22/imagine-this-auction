// Demo Mode Configuration
// ⚠️  WARNING: Only enable in development or staging environments

export const DEMO = {
  // Master switch - NEVER set to true in production
  ENABLED: process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true',

  // Reset & Seeding Configuration
  RESET_ON_RUN: false,                    // Set true to wipe & reseed on start

  // Auction Structure
  NUM_AUCTIONEERS: 3,
  AUCTIONS_PER_AUCTIONEER: 2,
  LOTS_PER_AUCTION: 12,

  // Lot Pricing (in ITC)
  LOT_MIN_START_ITC: 10,
  LOT_MAX_START_ITC: 250,
  LOT_MIN_ESTIMATE_ITC: 50,
  LOT_MAX_ESTIMATE_ITC: 1000,

  // Timing Configuration
  LOT_DURATION_SEC: 420,                 // 7 minutes per lot
  SOFT_CLOSE_WINDOW_SEC: 30,             // Anti-sniping: extend if bid in last 30s
  SOFT_CLOSE_EXTEND_SEC: 60,             // Extend by 60s on snipe
  AUCTION_START_DELAY_MIN: 2,            // Start auctions in 2 minutes

  // Bot Configuration
  NUM_BOT_BIDDERS: 14,
  BOT_MAX_BID_ITC: 1500,
  BOT_STRATEGIES: ["early", "mid", "sniper", "chaser"] as const,
  BOT_THROTTLE_MS: [4000, 12000] as const, // Random delay between bot bids
  BOT_BID_INCREMENT_MIN: 0.02,           // Min 2% increment
  BOT_BID_INCREMENT_MAX: 0.07,           // Max 7% increment

  // Credit Configuration
  CREDIT_TOPUP_ITC: 5000,                // Starting ITC for each bot
  HUMAN_SEED_ITC: 2000,                  // ITC for demo human users

  // Realtime Configuration
  REALTIME_CHANNEL_PREFIX: "lot_",       // Supabase channel per lot
  TIMER_TICK_INTERVAL_MS: 1000,          // Timer updates every second

  // Demo Identification
  DEMO_LABEL: "DEMO_RUN",                // Tag all seeded rows
  DEMO_VERSION: "1.0.0",                 // Version for tracking

  // Categories for lot generation
  CATEGORIES: [
    { name: "Sneakers", weight: 20 },
    { name: "Electronics", weight: 15 },
    { name: "Watches", weight: 15 },
    { name: "Collectibles", weight: 20 },
    { name: "Art", weight: 10 },
    { name: "Jewelry", weight: 10 },
    { name: "Books", weight: 5 },
    { name: "Vintage", weight: 5 }
  ],

  // Placeholder images for lots
  PLACEHOLDER_IMAGES: {
    sneakers: [
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400",
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400",
      "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=400"
    ],
    electronics: [
      "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400",
      "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=400",
      "https://images.unsplash.com/photo-1542393545-10f5cde2c810?w=400"
    ],
    watches: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
      "https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?w=400",
      "https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=400"
    ],
    collectibles: [
      "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400"
    ],
    art: [
      "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400",
      "https://images.unsplash.com/photo-1549887534-1541e9326642?w=400",
      "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=400"
    ],
    jewelry: [
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400",
      "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=400",
      "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=400"
    ],
    books: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400",
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400"
    ],
    vintage: [
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
      "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400"
    ]
  }
} as const

// Type definitions for demo system
export type BotStrategy = typeof DEMO.BOT_STRATEGIES[number]

export interface DemoLotTemplate {
  category: string
  title: string
  description: string
  brand?: string
  tags: string[]
}

export interface DemoAuctioneerTemplate {
  company_name: string
  business_license: string
  address_line1: string
  city: string
  state: string
  zip_code: string
  website?: string
}

export interface DemoUserTemplate {
  email: string
  first_name: string
  last_name: string
  role: 'bidder' | 'auctioneer'
  is_bot?: boolean
  bot_strategy?: BotStrategy
}

// Validation functions
export function validateDemoConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (DEMO.ENABLED && process.env.NODE_ENV === 'production') {
    errors.push('Demo mode cannot be enabled in production')
  }

  if (DEMO.LOT_DURATION_SEC < 60) {
    errors.push('Lot duration must be at least 60 seconds')
  }

  if (DEMO.SOFT_CLOSE_WINDOW_SEC >= DEMO.LOT_DURATION_SEC) {
    errors.push('Soft close window must be less than lot duration')
  }

  if (DEMO.NUM_BOT_BIDDERS < 1) {
    errors.push('Must have at least 1 bot bidder')
  }

  if (DEMO.BOT_THROTTLE_MS[0] > DEMO.BOT_THROTTLE_MS[1]) {
    errors.push('Bot throttle min must be less than max')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// Runtime state management
export class DemoState {
  private static instance: DemoState
  private _isRunning = false
  private _runId: string | null = null
  private _startTime: Date | null = null

  static getInstance(): DemoState {
    if (!this.instance) {
      this.instance = new DemoState()
    }
    return this.instance
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  get runId(): string | null {
    return this._runId
  }

  get startTime(): Date | null {
    return this._startTime
  }

  start(runId: string): void {
    this._isRunning = true
    this._runId = runId
    this._startTime = new Date()
  }

  stop(): void {
    this._isRunning = false
    this._runId = null
    this._startTime = null
  }

  getUptime(): number {
    if (!this._startTime) return 0
    return Date.now() - this._startTime.getTime()
  }
}

// Utility functions
export function generateDemoRunId(): string {
  return `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function isDemoData(record: any): boolean {
  return record.demo_label === DEMO.DEMO_LABEL ||
         record.metadata?.demo_run_id ||
         record.tags?.includes('demo')
}

export function createDemoMetadata(runId: string) {
  return {
    demo_run_id: runId,
    demo_label: DEMO.DEMO_LABEL,
    demo_version: DEMO.DEMO_VERSION,
    created_at: new Date().toISOString()
  }
}

// Export configuration with validation
const validation = validateDemoConfig()
if (!validation.valid) {
  console.error('❌ Demo configuration errors:', validation.errors)
  if (DEMO.ENABLED) {
    throw new Error(`Demo configuration invalid: ${validation.errors.join(', ')}`)
  }
}

if (DEMO.ENABLED) {
  console.log('🎭 Demo mode is ENABLED')
  console.log(`   - ${DEMO.NUM_AUCTIONEERS} auctioneers, ${DEMO.AUCTIONS_PER_AUCTIONEER * DEMO.NUM_AUCTIONEERS} auctions`)
  console.log(`   - ${DEMO.NUM_BOT_BIDDERS} bot bidders with strategies: ${DEMO.BOT_STRATEGIES.join(', ')}`)
  console.log(`   - Lot duration: ${DEMO.LOT_DURATION_SEC}s, Anti-snipe: ${DEMO.SOFT_CLOSE_WINDOW_SEC}s → +${DEMO.SOFT_CLOSE_EXTEND_SEC}s`)
} else {
  console.log('🎭 Demo mode is DISABLED')
}