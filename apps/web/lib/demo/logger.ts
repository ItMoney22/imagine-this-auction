/**
 * Demo Mode Logging and Diagnostics
 *
 * Provides comprehensive logging, metrics, and diagnostics for demo mode.
 * Helps track auction performance, bot behavior, and system health.
 */

import { DEMO, generateDemoRunId } from '@/config/demo'
import { createClient } from '@supabase/supabase-js'

// Lazy Supabase client - only initialized when demo mode is active
let _supabase: ReturnType<typeof createClient> | null = null
const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    }
    return (_supabase as any)[prop]
  }
})

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export type LogCategory =
  | 'auction_timer'
  | 'bidding_bot'
  | 'demo_control'
  | 'realtime'
  | 'database'
  | 'performance'
  | 'error'

export interface LogEntry {
  id?: string
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  details?: any
  demo_run_id?: string
  component?: string
  lot_id?: string
  user_id?: string
  auction_id?: string
  duration_ms?: number
  memory_usage?: number
  error_stack?: string
}

export interface DemoMetrics {
  uptime_ms: number
  active_lots: number
  active_bots: number
  total_bids: number
  bid_rate_per_minute: number
  avg_lot_duration_ms: number
  anti_snipe_triggers: number
  error_rate: number
  memory_usage_mb: number
  cpu_usage_percent?: number
}

export interface PerformanceMetric {
  component: string
  operation: string
  duration_ms: number
  timestamp: string
  success: boolean
  details?: any
}

class DemoLogger {
  private static instance: DemoLogger
  private logBuffer: LogEntry[] = []
  private metricsBuffer: PerformanceMetric[] = []
  private bufferFlushInterval?: NodeJS.Timeout
  private metricsInterval?: NodeJS.Timeout
  private isEnabled: boolean

  constructor() {
    this.isEnabled = DEMO.ENABLED

    if (this.isEnabled) {
      this.startBufferFlush()
      this.startMetricsCollection()
    }
  }

  static getInstance(): DemoLogger {
    if (!this.instance) {
      this.instance = new DemoLogger()
    }
    return this.instance
  }

  // Core logging methods
  debug(category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>): void {
    this.log('debug', category, message, details, context)
  }

  info(category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>): void {
    this.log('info', category, message, details, context)
  }

  warn(category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>): void {
    this.log('warn', category, message, details, context)
  }

  error(category: LogCategory, message: string, error?: Error, context?: Partial<LogEntry>): void {
    const details = error ? {
      error_message: error.message,
      error_stack: error.stack,
      error_name: error.name
    } : undefined

    this.log('error', category, message, details, {
      ...context,
      error_stack: error?.stack
    })
  }

  critical(category: LogCategory, message: string, error?: Error, context?: Partial<LogEntry>): void {
    const details = error ? {
      error_message: error.message,
      error_stack: error.stack,
      error_name: error.name
    } : undefined

    this.log('critical', category, message, details, {
      ...context,
      error_stack: error?.stack
    })

    // Immediate flush for critical errors
    this.flushLogs()
  }

  private log(level: LogLevel, category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>): void {
    if (!this.isEnabled) return

    const logEntry: LogEntry = {
      id: generateDemoRunId(),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
      memory_usage: this.getMemoryUsage(),
      ...context
    }

    // Console output with formatting
    this.logToConsole(logEntry)

    // Add to buffer
    this.logBuffer.push(logEntry)

    // Auto-flush if buffer is large
    if (this.logBuffer.length > 100) {
      this.flushLogs()
    }
  }

  private logToConsole(entry: LogEntry): void {
    const colors = {
      debug: '\x1b[36m',   // Cyan
      info: '\x1b[32m',    // Green
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      critical: '\x1b[41m' // Red background
    }

    const reset = '\x1b[0m'
    const color = colors[entry.level] || ''

    const prefix = `${color}[${entry.level.toUpperCase()}]${reset}`
    const category = `[${entry.category}]`
    const component = entry.component ? `[${entry.component}]` : ''
    const context = entry.lot_id ? `[lot:${entry.lot_id}]` : ''

    console.log(`${prefix} ${category}${component}${context} ${entry.message}`)

    if (entry.details && (entry.level === 'error' || entry.level === 'critical')) {
      console.log('  Details:', entry.details)
    }

    if (entry.error_stack && (entry.level === 'error' || entry.level === 'critical')) {
      console.log('  Stack:', entry.error_stack)
    }
  }

  // Performance tracking
  startTimer(component: string, operation: string): () => void {
    const startTime = Date.now()
    const startMemory = this.getMemoryUsage()

    return () => {
      const duration = Date.now() - startTime
      const endMemory = this.getMemoryUsage()

      this.recordPerformance({
        component,
        operation,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        success: true,
        details: {
          memory_start: startMemory,
          memory_end: endMemory,
          memory_delta: endMemory - startMemory
        }
      })

      // Log slow operations
      if (duration > 1000) {
        this.warn('performance', `Slow operation: ${component}.${operation}`, {
          duration_ms: duration,
          memory_delta: endMemory - startMemory
        })
      }
    }
  }

  recordPerformance(metric: PerformanceMetric): void {
    if (!this.isEnabled) return

    this.metricsBuffer.push(metric)

    // Auto-flush if buffer is large
    if (this.metricsBuffer.length > 50) {
      this.flushMetrics()
    }
  }

  // Auction-specific logging
  logBidPlaced(lotId: string, userId: string, amount: number, isBot: boolean): void {
    this.info('bidding_bot', `Bid placed: ${amount} ITC`, {
      lot_id: lotId,
      user_id: userId,
      amount_itc: amount,
      is_bot: isBot,
      bid_type: isBot ? 'bot' : 'human'
    }, {
      lot_id: lotId,
      user_id: userId
    })
  }

  logLotStarted(lotId: string, auctionId: string, lotNumber: number, title: string): void {
    this.info('auction_timer', `Lot started: #${lotNumber} - ${title}`, {
      lot_id: lotId,
      auction_id: auctionId,
      lot_number: lotNumber,
      title,
      duration_sec: DEMO.LOT_DURATION_SEC
    }, {
      lot_id: lotId,
      auction_id: auctionId
    })
  }

  logLotEnded(lotId: string, lotNumber: number, finalBid: number, reason: string): void {
    this.info('auction_timer', `Lot ended: #${lotNumber} - ${finalBid} ITC`, {
      lot_id: lotId,
      lot_number: lotNumber,
      final_bid_itc: finalBid,
      end_reason: reason
    }, {
      lot_id: lotId
    })
  }

  logAntiSnipe(lotId: string, lotNumber: number, extensionSeconds: number): void {
    this.warn('auction_timer', `Anti-snipe triggered: Lot #${lotNumber} extended ${extensionSeconds}s`, {
      lot_id: lotId,
      lot_number: lotNumber,
      extension_seconds: extensionSeconds,
      trigger_type: 'soft_close'
    }, {
      lot_id: lotId
    })
  }

  logBotStrategy(botId: string, strategy: string, action: string, lotId: string): void {
    this.debug('bidding_bot', `Bot strategy: ${strategy} - ${action}`, {
      bot_id: botId,
      strategy,
      action,
      lot_id: lotId
    }, {
      user_id: botId,
      lot_id: lotId,
      component: `bot-${strategy}`
    })
  }

  // System metrics
  async collectMetrics(): Promise<DemoMetrics> {
    const stopTimer = this.startTimer('demo_logger', 'collect_metrics')

    try {
      const now = Date.now()
      const startTime = this.getStartTime()
      const uptime = startTime ? now - startTime.getTime() : 0

      const { data: demoUsers, error: demoUsersError } = await supabase
        .from('users')
        .select('id, email, created_at')
        .or('email.ilike.%demo%,email.ilike.%bot%')

      if (demoUsersError) {
        throw demoUsersError
      }

      const demoUserIds = demoUsers?.map((user) => user.id) || []
      const botUserIds = demoUsers
        ?.filter((user) => user.email?.toLowerCase().includes('bot'))
        .map((user) => user.id) || []

      const { data: demoAuctioneers, error: auctioneersError } = await supabase
        .from('auctioneers')
        .select('id, user_id')
        .in('user_id', demoUserIds.length > 0 ? demoUserIds : ['00000000-0000-0000-0000-000000000000'])

      if (auctioneersError) {
        throw auctioneersError
      }

      const demoAuctioneerIds = demoAuctioneers?.map((auctioneer) => auctioneer.id) || []

      const { data: demoAuctions, error: auctionsError } = await supabase
        .from('auctions')
        .select('id')
        .in(
          'auctioneer_id',
          demoAuctioneerIds.length > 0 ? demoAuctioneerIds : ['00000000-0000-0000-0000-000000000000']
        )

      if (auctionsError) {
        throw auctionsError
      }

      const demoAuctionIds = demoAuctions?.map((auction) => auction.id) || []

      const [activeLotsResult, totalBidsResult] = await Promise.all([
        supabase
          .from('lots')
          .select('id, auction_id, is_sold, created_at', { count: 'exact' })
          .in(
            'auction_id',
            demoAuctionIds.length > 0 ? demoAuctionIds : ['00000000-0000-0000-0000-000000000000']
          )
          .eq('is_sold', false),
        supabase
          .from('bids')
          .select('id, bidder_id, created_at', { count: 'exact' })
          .in('bidder_id', demoUserIds.length > 0 ? demoUserIds : ['00000000-0000-0000-0000-000000000000']),
      ])

      if (activeLotsResult.error) {
        throw activeLotsResult.error
      }

      if (totalBidsResult.error) {
        throw totalBidsResult.error
      }

      const activeLots = activeLotsResult.count || 0
      const totalBids = totalBidsResult.count || 0
      const activeBots = botUserIds.length

      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString()
      const { count: recentBids, error: recentBidsError } = await supabase
        .from('bids')
        .select('id', { count: 'exact', head: true })
        .in('bidder_id', demoUserIds.length > 0 ? demoUserIds : ['00000000-0000-0000-0000-000000000000'])
        .gte('created_at', fiveMinutesAgo)

      if (recentBidsError) {
        throw recentBidsError
      }

      const bidRatePerMinute = recentBids ? recentBids / 5 : 0

      const { data: recentLots, error: recentLotsError } = await supabase
        .from('lots')
        .select('id, auction_id, is_sold, created_at')
        .in(
          'auction_id',
          demoAuctionIds.length > 0 ? demoAuctionIds : ['00000000-0000-0000-0000-000000000000']
        )
        .eq('is_sold', true)
        .order('created_at', { ascending: false })
        .limit(10)

      if (recentLotsError) {
        throw recentLotsError
      }

      let avgLotDuration = DEMO.LOT_DURATION_SEC * 1000
      if (recentLots && recentLots.length > 0) {
        const durations = recentLots.map((lot) => now - new Date(lot.created_at).getTime())
        avgLotDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      }

      // Count anti-snipe triggers (from logs)
      const antiSnipeTriggers = this.logBuffer.filter(
        log => log.category === 'auction_timer' &&
               log.details?.trigger_type === 'soft_close'
      ).length

      // Calculate error rate
      const totalLogs = this.logBuffer.length
      const errorLogs = this.logBuffer.filter(log =>
        log.level === 'error' || log.level === 'critical'
      ).length
      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0

      const metrics: DemoMetrics = {
        uptime_ms: uptime,
        active_lots: activeLots || 0,
        active_bots: activeBots || 0,
        total_bids: totalBids || 0,
        bid_rate_per_minute: bidRatePerMinute,
        avg_lot_duration_ms: avgLotDuration,
        anti_snipe_triggers: antiSnipeTriggers,
        error_rate: errorRate,
        memory_usage_mb: this.getMemoryUsage()
      }

      stopTimer()
      return metrics

    } catch (error) {
      stopTimer()
      this.error('demo_control', 'Failed to collect metrics', error as Error)
      throw error
    }
  }

  // Buffer management
  private startBufferFlush(): void {
    this.bufferFlushInterval = setInterval(() => {
      this.flushLogs()
    }, 30000) // Flush every 30 seconds
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.flushMetrics()
    }, 60000) // Flush every minute
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return

    try {
      const logs = [...this.logBuffer]
      this.logBuffer = []

      // In a real implementation, you might save to database
      // For demo, we'll just keep recent logs in memory
      this.keepRecentLogs(logs)

    } catch (error) {
      console.error('Failed to flush logs:', error)
      // Re-add logs to buffer if flush failed
      this.logBuffer.unshift(...this.logBuffer)
    }
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return

    try {
      const metrics = [...this.metricsBuffer]
      this.metricsBuffer = []

      // Process metrics (calculate averages, etc.)
      const avgDuration = metrics.reduce((sum, m) => sum + m.duration_ms, 0) / metrics.length
      const successRate = (metrics.filter(m => m.success).length / metrics.length) * 100

      this.debug('performance', `Performance summary: ${avgDuration.toFixed(2)}ms avg, ${successRate.toFixed(1)}% success rate`, {
        total_operations: metrics.length,
        avg_duration_ms: avgDuration,
        success_rate_percent: successRate,
        operations: metrics.map(m => `${m.component}.${m.operation}`).join(', ')
      })

    } catch (error) {
      console.error('Failed to flush metrics:', error)
    }
  }

  private keepRecentLogs(logs: LogEntry[]): void {
    // Keep last 1000 logs in memory for debugging
    const maxLogs = 1000
    this.logBuffer = [...logs, ...this.logBuffer].slice(0, maxLogs)
  }

  // Utility methods
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }
    return 0
  }

  private getStartTime(): Date | null {
    try {
      const { DemoState } = require('@/config/demo')
      return DemoState.getInstance().startTime
    } catch {
      return null
    }
  }

  // Query methods
  getRecentLogs(category?: LogCategory, level?: LogLevel, limit = 50): LogEntry[] {
    let logs = [...this.logBuffer].reverse() // Most recent first

    if (category) {
      logs = logs.filter(log => log.category === category)
    }

    if (level) {
      logs = logs.filter(log => log.level === level)
    }

    return logs.slice(0, limit)
  }

  getErrorSummary(): { total: number; critical: number; recent: LogEntry[] } {
    const errors = this.logBuffer.filter(log =>
      log.level === 'error' || log.level === 'critical'
    )

    const critical = errors.filter(log => log.level === 'critical')
    const recent = errors.slice(-10).reverse()

    return {
      total: errors.length,
      critical: critical.length,
      recent
    }
  }

  // Cleanup
  stop(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval)
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }

    // Final flush
    this.flushLogs()
    this.flushMetrics()

    this.info('demo_control', 'Demo logger stopped')
  }
}

// Export singleton instance
export const demoLogger = DemoLogger.getInstance()

// Convenience exports
export const log = {
  debug: (category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>) =>
    demoLogger.debug(category, message, details, context),

  info: (category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>) =>
    demoLogger.info(category, message, details, context),

  warn: (category: LogCategory, message: string, details?: any, context?: Partial<LogEntry>) =>
    demoLogger.warn(category, message, details, context),

  error: (category: LogCategory, message: string, error?: Error, context?: Partial<LogEntry>) =>
    demoLogger.error(category, message, error, context),

  critical: (category: LogCategory, message: string, error?: Error, context?: Partial<LogEntry>) =>
    demoLogger.critical(category, message, error, context)
}

export { DemoLogger }
