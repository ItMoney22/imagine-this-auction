import { NextRequest, NextResponse } from 'next/server'
import { DEMO } from '@/config/demo'
import { demoLogger, type LogLevel, type LogCategory } from '@/lib/demo/logger'

export const dynamic = 'force-dynamic'

/**
 * Demo Logs API
 *
 * Provides access to demo logging data and diagnostics.
 * Used by the admin interface to monitor system health.
 */

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  if (!DEMO.ENABLED) {
    return NextResponse.json(
      { error: 'Demo mode is not enabled' },
      { status: 400 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as LogCategory | null
    const level = searchParams.get('level') as LogLevel | null
    const limit = parseInt(searchParams.get('limit') || '50')
    const action = searchParams.get('action')

    switch (action) {
      case 'recent':
        return await getRecentLogs(category, level, limit)
      case 'errors':
        return await getErrorSummary()
      case 'metrics':
        return await getMetrics()
      default:
        return await getLogsSummary()
    }
  } catch (error) {
    console.error('Demo logs API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function getRecentLogs(category: LogCategory | null, level: LogLevel | null, limit: number) {
  const logs = demoLogger.getRecentLogs(category || undefined, level || undefined, limit)

  return NextResponse.json({
    success: true,
    logs,
    total: logs.length,
    filters: {
      category,
      level,
      limit
    }
  })
}

async function getErrorSummary() {
  const errorSummary = demoLogger.getErrorSummary()

  return NextResponse.json({
    success: true,
    ...errorSummary
  })
}

async function getMetrics() {
  try {
    const metrics = await demoLogger.collectMetrics()

    return NextResponse.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to collect metrics: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

async function getLogsSummary() {
  const recentLogs = demoLogger.getRecentLogs(undefined, undefined, 20)
  const errorSummary = demoLogger.getErrorSummary()

  // Count logs by category
  const categoryStats = recentLogs.reduce((stats, log) => {
    stats[log.category] = (stats[log.category] || 0) + 1
    return stats
  }, {} as Record<string, number>)

  // Count logs by level
  const levelStats = recentLogs.reduce((stats, log) => {
    stats[log.level] = (stats[log.level] || 0) + 1
    return stats
  }, {} as Record<string, number>)

  return NextResponse.json({
    success: true,
    summary: {
      total_logs: recentLogs.length,
      total_errors: errorSummary.total,
      critical_errors: errorSummary.critical,
      category_breakdown: categoryStats,
      level_breakdown: levelStats
    },
    recent_logs: recentLogs.slice(0, 10),
    recent_errors: errorSummary.recent.slice(0, 5)
  })
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  if (!DEMO.ENABLED) {
    return NextResponse.json(
      { error: 'Demo mode is not enabled' },
      { status: 400 }
    )
  }

  try {
    const { action } = await request.json()

    switch (action) {
      case 'clear':
        // Clear logs (implementation would depend on storage)
        return NextResponse.json({
          success: true,
          message: 'Logs cleared'
        })
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Demo logs POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
