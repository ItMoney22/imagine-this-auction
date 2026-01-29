#!/usr/bin/env tsx
/**
 * Auction Timer Worker
 *
 * Handles lot timing, transitions, and anti-sniping logic.
 * Runs as a background process or triggered by cron.
 *
 * Features:
 * - Real-time lot progression through auction
 * - Anti-sniping (soft close) protection
 * - Automatic lot transitions
 * - Realtime channel updates
 * - Graceful error handling
 *
 * Usage:
 *   pnpm tsx workers/auction-timer.ts
 *   PM2: pm2 start workers/auction-timer.ts --name "auction-timer"
 */

import { createClient } from '@supabase/supabase-js'
import { DEMO } from '../config/demo'
import chalk from 'chalk'

// Environment setup
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AuctionLot {
  id: string
  auction_id: string
  lot_number: number
  title: string
  status: string
  current_bid_itc?: number
  start_price_itc: number
  lot_starts_at?: string
  lot_ends_at?: string
  soft_close_triggered?: boolean
  original_end_time?: string
  auction: {
    id: string
    status: string
    title: string
  }
}

interface TimerState {
  currentLots: Map<string, AuctionLot>
  timers: Map<string, NodeJS.Timeout>
  channels: Map<string, any>
}

class AuctionTimer {
  private state: TimerState = {
    currentLots: new Map(),
    timers: new Map(),
    channels: new Map()
  }

  private isRunning = false
  private healthCheckInterval?: NodeJS.Timeout

  constructor() {
    this.setupGracefulShutdown()
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('⚠️  Auction timer already running'))
      return
    }

    console.log(chalk.blue('⏰ Starting auction timer worker...'))
    this.isRunning = true

    // Initialize current lot states
    await this.initializeActiveLots()

    // Start health check
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, 30000) // Every 30 seconds

    console.log(chalk.green('✅ Auction timer started'))
    console.log(chalk.blue(`📊 Monitoring ${this.state.currentLots.size} active lots`))

    // Keep process alive
    this.keepAlive()
  }

  async stop(): Promise<void> {
    console.log(chalk.yellow('🛑 Stopping auction timer...'))
    this.isRunning = false

    // Clear all timers
    for (const [lotId, timer] of this.state.timers) {
      clearTimeout(timer)
      console.log(chalk.gray(`⏹️  Cleared timer for lot ${lotId}`))
    }

    // Clear health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    // Close realtime channels
    for (const [channelName, channel] of this.state.channels) {
      await supabase.removeChannel(channel)
      console.log(chalk.gray(`📻 Closed channel ${channelName}`))
    }

    this.state.currentLots.clear()
    this.state.timers.clear()
    this.state.channels.clear()

    console.log(chalk.green('✅ Auction timer stopped'))
  }

  private async initializeActiveLots(): Promise<void> {
    const { data: lots, error } = await supabase
      .from('lots')
      .select(`
        id, auction_id, lot_number, title, status,
        current_bid_itc, start_price_itc,
        lot_starts_at, lot_ends_at, soft_close_triggered, original_end_time,
        auctions!inner(id, status, title)
      `)
      .eq('auctions.status', 'live')
      .in('status', ['live', 'ending_soon'])
      .eq('demo_label', DEMO.DEMO_LABEL)

    if (error) {
      console.error(chalk.red('❌ Failed to fetch active lots:', error.message))
      return
    }

    if (!lots || lots.length === 0) {
      console.log(chalk.gray('📝 No active lots found'))
      return
    }

    for (const lot of lots) {
      this.state.currentLots.set(lot.id, {
        ...lot,
        auction: lot.auctions
      })

      await this.setupLotTimer(lot as AuctionLot)
      await this.setupRealtimeChannel(lot.id)
    }

    console.log(chalk.blue(`📋 Initialized ${lots.length} active lots`))
  }

  private async setupLotTimer(lot: AuctionLot): Promise<void> {
    if (!lot.lot_ends_at) {
      console.warn(chalk.yellow(`⚠️  Lot ${lot.id} has no end time`))
      return
    }

    const endTime = new Date(lot.lot_ends_at)
    const now = new Date()
    const msUntilEnd = endTime.getTime() - now.getTime()

    if (msUntilEnd <= 0) {
      // Lot should have ended
      await this.endLot(lot.id, 'Timer expired')
      return
    }

    // Clear existing timer
    const existingTimer = this.state.timers.get(lot.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new timer
    const timer = setTimeout(async () => {
      await this.endLot(lot.id, 'Timer expired')
    }, msUntilEnd)

    this.state.timers.set(lot.id, timer)

    console.log(chalk.gray(`⏲️  Set timer for lot ${lot.lot_number}: ${Math.round(msUntilEnd / 1000)}s`))
  }

  private async setupRealtimeChannel(lotId: string): Promise<void> {
    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`

    // Remove existing channel
    const existingChannel = this.state.channels.get(channelName)
    if (existingChannel) {
      await supabase.removeChannel(existingChannel)
    }

    // Create new channel
    const channel = supabase.channel(channelName)

    // Listen for bid events to handle anti-sniping
    channel.on('postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: `lot_id=eq.${lotId}`
      },
      async (payload) => {
        await this.handleNewBid(lotId, payload.new)
      }
    )

    await channel.subscribe()
    this.state.channels.set(channelName, channel)

    console.log(chalk.gray(`📻 Setup realtime channel: ${channelName}`))
  }

  private async handleNewBid(lotId: string, bidData: any): Promise<void> {
    const lot = this.state.currentLots.get(lotId)
    if (!lot || !lot.lot_ends_at) return

    const endTime = new Date(lot.lot_ends_at)
    const now = new Date()
    const msUntilEnd = endTime.getTime() - now.getTime()

    // Check if bid is within soft close window
    if (msUntilEnd > 0 && msUntilEnd <= DEMO.SOFT_CLOSE_WINDOW_SEC * 1000) {
      await this.triggerSoftClose(lotId, lot)
    }

    // Update lot state
    lot.current_bid_itc = bidData.amount_itc
    this.state.currentLots.set(lotId, lot)

    // Broadcast timer update
    await this.broadcastTimerUpdate(lotId, lot)

    console.log(chalk.blue(`💰 New bid on lot ${lot.lot_number}: ${bidData.amount_itc} ITC (${Math.round(msUntilEnd / 1000)}s left)`))
  }

  private async triggerSoftClose(lotId: string, lot: AuctionLot): Promise<void> {
    if (lot.soft_close_triggered) {
      console.log(chalk.gray(`⏰ Soft close already triggered for lot ${lot.lot_number}`))
      return
    }

    const currentEndTime = new Date(lot.lot_ends_at!)
    const newEndTime = new Date(currentEndTime.getTime() + DEMO.SOFT_CLOSE_EXTEND_SEC * 1000)

    // Update database
    const { error } = await supabase
      .from('lots')
      .update({
        lot_ends_at: newEndTime.toISOString(),
        soft_close_triggered: true,
        original_end_time: lot.original_end_time || currentEndTime.toISOString()
      })
      .eq('id', lotId)

    if (error) {
      console.error(chalk.red(`❌ Failed to trigger soft close for lot ${lotId}:`, error.message))
      return
    }

    // Update local state
    lot.lot_ends_at = newEndTime.toISOString()
    lot.soft_close_triggered = true
    lot.original_end_time = lot.original_end_time || currentEndTime.toISOString()
    this.state.currentLots.set(lotId, lot)

    // Reset timer
    await this.setupLotTimer(lot)

    // Broadcast anti-snipe notification
    await this.broadcastAntiSnipe(lotId, lot, DEMO.SOFT_CLOSE_EXTEND_SEC)

    console.log(chalk.yellow(`🔄 ANTI-SNIPE: Extended lot ${lot.lot_number} by ${DEMO.SOFT_CLOSE_EXTEND_SEC}s`))
  }

  private async endLot(lotId: string, reason: string): Promise<void> {
    const lot = this.state.currentLots.get(lotId)
    if (!lot) return

    // Update lot status
    const { error } = await supabase
      .from('lots')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        ended_reason: reason
      })
      .eq('id', lotId)

    if (error) {
      console.error(chalk.red(`❌ Failed to end lot ${lotId}:`, error.message))
      return
    }

    // Clear timer
    const timer = this.state.timers.get(lotId)
    if (timer) {
      clearTimeout(timer)
      this.state.timers.delete(lotId)
    }

    // Close channel
    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`
    const channel = this.state.channels.get(channelName)
    if (channel) {
      await supabase.removeChannel(channel)
      this.state.channels.delete(channelName)
    }

    // Remove from state
    this.state.currentLots.delete(lotId)

    // Broadcast lot end
    await this.broadcastLotEnd(lotId, lot, reason)

    console.log(chalk.green(`🏁 Lot ${lot.lot_number} ended: ${reason}`))

    // Start next lot in sequence
    await this.startNextLot(lot.auction_id)
  }

  private async startNextLot(auctionId: string): Promise<void> {
    // Find next lot in sequence
    const { data: nextLot, error } = await supabase
      .from('lots')
      .select('*')
      .eq('auction_id', auctionId)
      .eq('status', 'approved')
      .eq('demo_label', DEMO.DEMO_LABEL)
      .order('lot_number', { ascending: true })
      .limit(1)
      .single()

    if (error || !nextLot) {
      console.log(chalk.gray(`📝 No more lots in auction ${auctionId}`))
      await this.checkAuctionCompletion(auctionId)
      return
    }

    // Start the next lot
    const startTime = new Date()
    const endTime = new Date(startTime.getTime() + DEMO.LOT_DURATION_SEC * 1000)

    const { error: updateError } = await supabase
      .from('lots')
      .update({
        status: 'live',
        lot_starts_at: startTime.toISOString(),
        lot_ends_at: endTime.toISOString()
      })
      .eq('id', nextLot.id)

    if (updateError) {
      console.error(chalk.red(`❌ Failed to start next lot:`, updateError.message))
      return
    }

    // Add to monitoring
    const lotWithAuction = {
      ...nextLot,
      status: 'live',
      lot_starts_at: startTime.toISOString(),
      lot_ends_at: endTime.toISOString(),
      auction: { id: auctionId, status: 'live', title: 'Demo Auction' }
    }

    this.state.currentLots.set(nextLot.id, lotWithAuction)
    await this.setupLotTimer(lotWithAuction)
    await this.setupRealtimeChannel(nextLot.id)

    // Broadcast lot start
    await this.broadcastLotStart(nextLot.id, lotWithAuction)

    console.log(chalk.green(`🚀 Started lot ${nextLot.lot_number}: ${nextLot.title}`))
  }

  private async checkAuctionCompletion(auctionId: string): Promise<void> {
    const { data: remainingLots } = await supabase
      .from('lots')
      .select('id')
      .eq('auction_id', auctionId)
      .in('status', ['approved', 'live'])
      .eq('demo_label', DEMO.DEMO_LABEL)

    if (!remainingLots || remainingLots.length === 0) {
      // End the auction
      await supabase
        .from('auctions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', auctionId)

      console.log(chalk.green(`🏁 Auction ${auctionId} completed`))
    }
  }

  private async broadcastTimerUpdate(lotId: string, lot: AuctionLot): Promise<void> {
    const endTime = new Date(lot.lot_ends_at!)
    const now = new Date()
    const secondsLeft = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000))

    const update = {
      type: 'timer_tick',
      lot_id: lotId,
      seconds_left: secondsLeft,
      current_bid_itc: lot.current_bid_itc || lot.start_price_itc,
      timestamp: now.toISOString()
    }

    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`
    const channel = this.state.channels.get(channelName)
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'timer_update',
        payload: update
      })
    }
  }

  private async broadcastAntiSnipe(lotId: string, lot: AuctionLot, extensionSeconds: number): Promise<void> {
    const update = {
      type: 'anti_snipe',
      lot_id: lotId,
      extension_seconds: extensionSeconds,
      new_end_time: lot.lot_ends_at,
      message: `Bidding extended by ${extensionSeconds} seconds!`,
      timestamp: new Date().toISOString()
    }

    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`
    const channel = this.state.channels.get(channelName)
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'anti_snipe',
        payload: update
      })
    }
  }

  private async broadcastLotEnd(lotId: string, lot: AuctionLot, reason: string): Promise<void> {
    const update = {
      type: 'lot_ended',
      lot_id: lotId,
      lot_number: lot.lot_number,
      final_bid_itc: lot.current_bid_itc,
      reason,
      timestamp: new Date().toISOString()
    }

    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`
    const channel = this.state.channels.get(channelName)
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'lot_ended',
        payload: update
      })
    }
  }

  private async broadcastLotStart(lotId: string, lot: AuctionLot): Promise<void> {
    const update = {
      type: 'lot_started',
      lot_id: lotId,
      lot_number: lot.lot_number,
      title: lot.title,
      start_price_itc: lot.start_price_itc,
      duration_seconds: DEMO.LOT_DURATION_SEC,
      ends_at: lot.lot_ends_at,
      timestamp: new Date().toISOString()
    }

    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lotId}`
    const channel = this.state.channels.get(channelName)
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'lot_started',
        payload: update
      })
    }
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.isRunning) return

    try {
      // Check database connectivity
      const { error } = await supabase.from('lots').select('id').limit(1)
      if (error) {
        console.error(chalk.red('❌ Health check failed - Database error:', error.message))
        return
      }

      // Check for orphaned lots (lots that should have ended)
      const now = new Date()
      for (const [lotId, lot] of this.state.currentLots) {
        if (lot.lot_ends_at && new Date(lot.lot_ends_at) < now) {
          console.warn(chalk.yellow(`⚠️  Found orphaned lot ${lot.lot_number}, ending now`))
          await this.endLot(lotId, 'Health check cleanup')
        }
      }

      // Sync with database state
      await this.syncWithDatabase()

      console.log(chalk.gray(`💚 Health check passed - ${this.state.currentLots.size} lots monitored`))
    } catch (error) {
      console.error(chalk.red('❌ Health check error:', error))
    }
  }

  private async syncWithDatabase(): Promise<void> {
    const { data: dbLots } = await supabase
      .from('lots')
      .select('id, status, lot_ends_at')
      .eq('demo_label', DEMO.DEMO_LABEL)
      .in('status', ['live', 'ending_soon'])

    if (!dbLots) return

    const dbLotIds = new Set(dbLots.map(l => l.id))
    const stateLotIds = new Set(this.state.currentLots.keys())

    // Remove lots that are no longer active in DB
    for (const lotId of stateLotIds) {
      if (!dbLotIds.has(lotId)) {
        console.log(chalk.yellow(`🧹 Removing stale lot ${lotId} from state`))
        await this.endLot(lotId, 'Database sync cleanup')
      }
    }

    // Add lots that are active in DB but not in state
    for (const dbLot of dbLots) {
      if (!stateLotIds.has(dbLot.id)) {
        console.log(chalk.blue(`🔄 Adding missing lot ${dbLot.id} to state`))
        // Re-fetch full lot data and add to monitoring
        const { data: fullLot } = await supabase
          .from('lots')
          .select(`
            *, auctions!inner(id, status, title)
          `)
          .eq('id', dbLot.id)
          .single()

        if (fullLot) {
          this.state.currentLots.set(dbLot.id, {
            ...fullLot,
            auction: fullLot.auctions
          })
          await this.setupLotTimer(fullLot as AuctionLot)
          await this.setupRealtimeChannel(dbLot.id)
        }
      }
    }
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

  private keepAlive(): void {
    // Send timer ticks
    const tickInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(tickInterval)
        return
      }

      for (const [lotId, lot] of this.state.currentLots) {
        await this.broadcastTimerUpdate(lotId, lot)
      }
    }, DEMO.TIMER_TICK_INTERVAL_MS)

    // Keep process alive
    const keepAliveInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(keepAliveInterval)
      }
    }, 1000)
  }
}

// Main execution
async function main() {
  if (!DEMO.ENABLED) {
    console.log(chalk.red('❌ Demo mode is not enabled'))
    process.exit(1)
  }

  const timer = new AuctionTimer()

  try {
    await timer.start()
  } catch (error) {
    console.error(chalk.red('❌ Failed to start auction timer:', error))
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

export { AuctionTimer }