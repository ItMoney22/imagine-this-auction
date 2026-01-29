#!/usr/bin/env tsx
/**
 * Bidding Bot Worker
 *
 * Manages AI bidders with realistic strategies and timing.
 * Creates natural auction dynamics and competition.
 *
 * Bot Strategies:
 * - Early: Bids early and often, then backs off
 * - Mid: Waits for activity, then joins in
 * - Sniper: Waits until final moments to bid
 * - Chaser: Follows other bidders, always trying to outbid
 *
 * Usage:
 *   pnpm tsx workers/bidding-bots.ts
 *   PM2: pm2 start workers/bidding-bots.ts --name "bidding-bots"
 */

import { createClient } from '@supabase/supabase-js'
import { DEMO, type BotStrategy } from '../config/demo'
import chalk from 'chalk'

// Environment setup
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface BotUser {
  id: string
  first_name: string
  last_name: string
  email: string
  strategy: BotStrategy
  max_bid_itc: number
  wallet_balance_itc: number
  active_bids: Map<string, number> // lot_id -> current_bid_amount
  last_bid_time: Date
  throttle_until: Date
}

interface LotInfo {
  id: string
  auction_id: string
  lot_number: number
  title: string
  category: string
  start_price_itc: number
  current_bid_itc?: number
  current_bidder_id?: string
  ends_at: string
  status: string
  bid_count: number
}

class BiddingBots {
  private bots: Map<string, BotUser> = new Map()
  private activeLots: Map<string, LotInfo> = new Map()
  private channels: Map<string, any> = new Map()
  private isRunning = false
  private botThinkingLoop?: NodeJS.Timeout

  constructor() {
    this.setupGracefulShutdown()
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('⚠️  Bidding bots already running'))
      return
    }

    console.log(chalk.blue('🤖 Starting bidding bots worker...'))
    this.isRunning = true

    // Load bot users
    await this.loadBotUsers()

    // Load active lots
    await this.loadActiveLots()

    // Setup realtime subscriptions
    await this.setupRealtimeSubscriptions()

    // Start bot thinking loop
    this.startBotThinkingLoop()

    console.log(chalk.green(`✅ Bidding bots started - ${this.bots.size} bots monitoring ${this.activeLots.size} lots`))
  }

  async stop(): Promise<void> {
    console.log(chalk.yellow('🛑 Stopping bidding bots...'))
    this.isRunning = false

    // Clear thinking loop
    if (this.botThinkingLoop) {
      clearTimeout(this.botThinkingLoop)
    }

    // Close realtime channels
    for (const [channelName, channel] of this.channels) {
      await supabase.removeChannel(channel)
      console.log(chalk.gray(`📻 Closed channel ${channelName}`))
    }

    this.bots.clear()
    this.activeLots.clear()
    this.channels.clear()

    console.log(chalk.green('✅ Bidding bots stopped'))
  }

  private async loadBotUsers(): Promise<void> {
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id, first_name, last_name, email,
        metadata,
        wallets(balance_itc)
      `)
      .eq('role', 'bidder')
      .eq('demo_label', DEMO.DEMO_LABEL)
      .not('metadata->>is_bot', 'is', null)

    if (error) {
      console.error(chalk.red('❌ Failed to load bot users:', error.message))
      return
    }

    if (!users || users.length === 0) {
      console.log(chalk.gray('📝 No bot users found'))
      return
    }

    for (const user of users) {
      const metadata = user.metadata || {}
      const strategy = metadata.bot_strategy || 'mid'
      const wallet = user.wallets?.[0]

      const bot: BotUser = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        strategy: strategy as BotStrategy,
        max_bid_itc: DEMO.BOT_MAX_BID_ITC,
        wallet_balance_itc: wallet?.balance_itc || 0,
        active_bids: new Map(),
        last_bid_time: new Date(0),
        throttle_until: new Date(0)
      }

      this.bots.set(user.id, bot)
    }

    console.log(chalk.blue(`🤖 Loaded ${this.bots.size} bot users`))
  }

  private async loadActiveLots(): Promise<void> {
    const { data: lots, error } = await supabase
      .from('lots')
      .select(`
        id, auction_id, lot_number, title, category,
        start_price_itc, current_bid_itc, current_bidder_id,
        lot_ends_at, status,
        bids(count)
      `)
      .eq('status', 'live')
      .eq('demo_label', DEMO.DEMO_LABEL)

    if (error) {
      console.error(chalk.red('❌ Failed to load active lots:', error.message))
      return
    }

    if (!lots || lots.length === 0) {
      console.log(chalk.gray('📝 No active lots found'))
      return
    }

    for (const lot of lots) {
      this.activeLots.set(lot.id, {
        id: lot.id,
        auction_id: lot.auction_id,
        lot_number: lot.lot_number,
        title: lot.title,
        category: lot.category,
        start_price_itc: lot.start_price_itc,
        current_bid_itc: lot.current_bid_itc,
        current_bidder_id: lot.current_bidder_id,
        ends_at: lot.lot_ends_at,
        status: lot.status,
        bid_count: lot.bids?.[0]?.count || 0
      })
    }

    console.log(chalk.blue(`📋 Loaded ${lots.length} active lots`))
  }

  private async setupRealtimeSubscriptions(): Promise<void> {
    // Subscribe to lot changes
    const lotChannel = supabase.channel('bot-lot-updates')
    lotChannel.on('postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lots',
        filter: `demo_label=eq.${DEMO.DEMO_LABEL}`
      },
      (payload) => {
        this.handleLotUpdate(payload)
      }
    )

    // Subscribe to bid changes
    const bidChannel = supabase.channel('bot-bid-updates')
    bidChannel.on('postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bids'
      },
      (payload) => {
        this.handleNewBid(payload.new)
      }
    )

    await lotChannel.subscribe()
    await bidChannel.subscribe()

    this.channels.set('lots', lotChannel)
    this.channels.set('bids', bidChannel)

    console.log(chalk.gray('📻 Setup realtime subscriptions'))
  }

  private handleLotUpdate(payload: any): void {
    const lot = payload.new
    if (!lot || lot.demo_label !== DEMO.DEMO_LABEL) return

    if (lot.status === 'live') {
      // Lot started
      this.activeLots.set(lot.id, {
        id: lot.id,
        auction_id: lot.auction_id,
        lot_number: lot.lot_number,
        title: lot.title,
        category: lot.category,
        start_price_itc: lot.start_price_itc,
        current_bid_itc: lot.current_bid_itc,
        current_bidder_id: lot.current_bidder_id,
        ends_at: lot.lot_ends_at,
        status: lot.status,
        bid_count: 0
      })

      console.log(chalk.green(`🚀 New lot started: ${lot.lot_number} - ${lot.title}`))
    } else if (lot.status === 'ended') {
      // Lot ended
      this.activeLots.delete(lot.id)

      // Clear bot active bids for this lot
      for (const bot of this.bots.values()) {
        bot.active_bids.delete(lot.id)
      }

      console.log(chalk.gray(`🏁 Lot ended: ${lot.lot_number}`))
    }
  }

  private handleNewBid(bidData: any): void {
    const lot = this.activeLots.get(bidData.lot_id)
    if (!lot) return

    // Update lot info
    lot.current_bid_itc = bidData.amount_itc
    lot.current_bidder_id = bidData.user_id
    lot.bid_count += 1

    // Update bot states
    const biddingBot = this.bots.get(bidData.user_id)
    if (biddingBot) {
      biddingBot.active_bids.set(bidData.lot_id, bidData.amount_itc)
      biddingBot.last_bid_time = new Date()
    }

    console.log(chalk.blue(`💰 New bid: ${bidData.amount_itc} ITC on lot ${lot.lot_number} by ${biddingBot?.first_name || 'human'}`))
  }

  private startBotThinkingLoop(): void {
    const think = async () => {
      if (!this.isRunning) return

      try {
        // Process each bot's decision for each active lot
        for (const bot of this.bots.values()) {
          for (const lot of this.activeLots.values()) {
            await this.processBotThinking(bot, lot)
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Bot thinking error:', error))
      }

      // Schedule next thinking cycle
      const delay = this.getRandomDelay(2000, 5000) // Think every 2-5 seconds
      this.botThinkingLoop = setTimeout(think, delay)
    }

    // Start thinking
    think()
  }

  private async processBotThinking(bot: BotUser, lot: LotInfo): Promise<void> {
    // Skip if bot is throttled
    if (new Date() < bot.throttle_until) return

    // Skip if lot is ending soon (less than 5 seconds) unless sniper strategy
    const timeLeft = new Date(lot.ends_at).getTime() - Date.now()
    if (timeLeft < 5000 && bot.strategy !== 'sniper') return

    // Skip if lot ended
    if (timeLeft <= 0) return

    // Check if bot should bid based on strategy
    const shouldBid = this.shouldBotBid(bot, lot, timeLeft)
    if (!shouldBid) return

    // Calculate bid amount
    const bidAmount = this.calculateBidAmount(bot, lot)
    if (!bidAmount) return

    // Place bid
    await this.placeBotBid(bot, lot, bidAmount)
  }

  private shouldBotBid(bot: BotUser, lot: LotInfo, timeLeftMs: number): boolean {
    const timeLeftSeconds = timeLeftMs / 1000
    const currentBid = lot.current_bid_itc || lot.start_price_itc
    const botCurrentBid = bot.active_bids.get(lot.id) || 0

    // Don't bid if already highest bidder
    if (lot.current_bidder_id === bot.id) return false

    // Don't bid if no wallet balance
    if (bot.wallet_balance_itc < currentBid * 1.1) return false

    // Don't bid if exceeds max bid
    if (currentBid >= bot.max_bid_itc) return false

    // Strategy-specific logic
    switch (bot.strategy) {
      case 'early':
        // Bid early and often, then back off
        return timeLeftSeconds > 180 && lot.bid_count < 5 && Math.random() < 0.3

      case 'mid':
        // Wait for some activity, then join in
        return timeLeftSeconds > 60 && timeLeftSeconds < 300 && lot.bid_count >= 2 && Math.random() < 0.4

      case 'sniper':
        // Wait until final moments
        return timeLeftSeconds < 30 && timeLeftSeconds > 5 && Math.random() < 0.7

      case 'chaser':
        // Follow other bidders, always trying to outbid
        const timeSinceLastBid = Date.now() - new Date(bot.last_bid_time).getTime()
        const hasRecentActivity = lot.bid_count > botCurrentBid ? 1 : 0
        return hasRecentActivity > 0 && timeSinceLastBid > 10000 && Math.random() < 0.5

      default:
        return Math.random() < 0.2
    }
  }

  private calculateBidAmount(bot: BotUser, lot: LotInfo): number | null {
    const currentBid = lot.current_bid_itc || lot.start_price_itc
    const minIncrement = Math.max(1, currentBid * DEMO.BOT_BID_INCREMENT_MIN)
    const maxIncrement = Math.max(1, currentBid * DEMO.BOT_BID_INCREMENT_MAX)

    // Random increment within range
    const increment = this.getRandomInt(minIncrement, maxIncrement)
    const newBidAmount = currentBid + increment

    // Don't exceed bot's max bid
    if (newBidAmount > bot.max_bid_itc) {
      return Math.min(bot.max_bid_itc, currentBid + 1)
    }

    // Don't exceed wallet balance (with some safety margin)
    const maxAffordable = bot.wallet_balance_itc * 0.9
    if (newBidAmount > maxAffordable) {
      return null
    }

    return Math.round(newBidAmount)
  }

  private async placeBotBid(bot: BotUser, lot: LotInfo, amount: number): Promise<void> {
    try {
      // Call bid placement API
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/bids`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lot_id: lot.id,
          user_id: bot.id,
          amount_itc: amount,
          is_bot_bid: true
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.warn(chalk.yellow(`⚠️  Bot ${bot.first_name} failed to bid: ${error.error}`))
        return
      }

      // Update bot state
      bot.active_bids.set(lot.id, amount)
      bot.last_bid_time = new Date()

      // Apply throttling
      const throttleMs = this.getRandomInt(DEMO.BOT_THROTTLE_MS[0], DEMO.BOT_THROTTLE_MS[1])
      bot.throttle_until = new Date(Date.now() + throttleMs)

      console.log(chalk.green(`🤖 ${bot.first_name} (${bot.strategy}) bid ${amount} ITC on lot ${lot.lot_number}`))

    } catch (error) {
      console.error(chalk.red(`❌ Bot bid error for ${bot.first_name}:`, error))
    }
  }

  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  private getRandomDelay(min: number, max: number): number {
    return this.getRandomInt(min, max)
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      console.log(chalk.yellow('\n🛑 Received shutdown signal'))
      await this.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    process.on('SIGUSR2', shutdown) // PM2 reload
  }
}

// Main execution
async function main() {
  if (!DEMO.ENABLED) {
    console.log(chalk.red('❌ Demo mode is not enabled'))
    process.exit(1)
  }

  const bots = new BiddingBots()

  try {
    await bots.start()
  } catch (error) {
    console.error(chalk.red('❌ Failed to start bidding bots:', error))
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ Fatal error:', error))
    process.exit(1)
  })
}

export { BiddingBots }