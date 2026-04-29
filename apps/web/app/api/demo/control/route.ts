import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEMO, DemoState, generateDemoRunId } from '@/config/demo'
import { exec } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Demo Control API
 *
 * Handles starting, stopping, and resetting demo mode.
 * Manages worker processes and database state.
 */

export async function POST(request: NextRequest) {
  let requestBody = null

  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
    }

    requestBody = await request.json()
    const { action } = requestBody

    console.log('Demo control POST request', {
      action,
      payload: requestBody,
      demo_config: {
        ENABLED: DEMO.ENABLED,
        DEMO_LABEL: DEMO.DEMO_LABEL,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE
      }
    })

    if (!DEMO.ENABLED) {
      console.error('Demo control: Demo mode disabled', {
        action,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
        DEMO_ENABLED: DEMO.ENABLED
      })
      return NextResponse.json(
        { error: 'Demo mode is not enabled' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const demoState = DemoState.getInstance()

    switch (action) {
      case 'start':
        return await startDemo(supabase, demoState)
      case 'stop':
        return await stopDemo(supabase, demoState)
      case 'reset':
        return await resetDemo(supabase, demoState)
      default:
        console.error('Demo control: Invalid action', {
          action,
          payload: requestBody,
          valid_actions: ['start', 'stop', 'reset']
        })
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Demo control: Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      payload: requestBody,
      demo_config: {
        ENABLED: DEMO.ENABLED,
        DEMO_LABEL: DEMO.DEMO_LABEL
      }
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

async function startDemo(supabase: any, demoState: DemoState) {
  console.log('Starting demo...', {
    current_state: {
      isRunning: demoState.isRunning,
      runId: demoState.runId,
      startTime: demoState.startTime
    },
    demo_label: DEMO.DEMO_LABEL
  })

  if (demoState.isRunning) {
    console.warn('Demo start: Already running', {
      current_run_id: demoState.runId,
      uptime: demoState.getUptime()
    })
    return NextResponse.json(
      { error: 'Demo is already running' },
      { status: 400 }
    )
  }

  const runId = generateDemoRunId()

  try {
    // Check if there's auction data (using existing data instead of demo-labeled data)
    console.log('Demo start: Checking for existing auction data...')

    const { data: auctions, error: auctionError } = await supabase
      .from('auctions')
      .select('id, title, status')
      .limit(5)

    if (auctionError) {
      console.error('Demo start: Failed to check auction data', {
        error: auctionError.message,
        details: auctionError.details,
        hint: auctionError.hint,
        code: auctionError.code
      })
      throw new Error('Failed to check auction data: ' + auctionError.message)
    }

    console.log('Demo start: Auction data check result', {
      auctions_found: auctions?.length || 0,
      auctions: auctions?.map(a => ({ id: a.id, title: a.title, status: a.status })) || []
    })

    if (!auctions || auctions.length === 0) {
      console.warn('Demo start: No auction data found')
      return NextResponse.json(
        { error: 'No auction data found in database.' },
        { status: 400 }
      )
    }

    // Use existing auctions for demo (simplified approach)
    console.log('Demo start: Using existing auctions for demo...')

    const { data: allAuctions, error: auctionsError } = await supabase
      .from('auctions')
      .select('id, title, status')

    if (auctionsError) {
      console.error('Demo start: Failed to fetch scheduled auctions', {
        error: auctionsError.message,
        details: auctionsError.details,
        hint: auctionsError.hint,
        code: auctionsError.code,
        demo_label: DEMO.DEMO_LABEL
      })
      throw new Error('Failed to fetch scheduled auctions: ' + auctionsError.message)
    }

    console.log('Demo start: Scheduled auctions found', {
      count: allAuctions?.length || 0,
      auction_ids: allAuctions?.map(a => a.id) || []
    })

    // For now, just simulate demo start without modifying existing data
    console.log('Demo start: Simulating demo start with existing data...', {
      auction_count: allAuctions?.length || 0
    })

    // Get some sample lots to show as "live" for demo purposes
    const { data: sampleLots, error: lotsError } = await supabase
      .from('lots')
      .select('id, lot_number, title, auction_id')
      .limit(3)

    if (lotsError) {
      console.warn('Demo start: Could not fetch sample lots', {
        error: lotsError.message
      })
    }

    console.log('Demo start: Sample lots for demo', {
      lots_found: sampleLots?.length || 0,
      lots: sampleLots?.map(l => ({ id: l.id, lot_number: l.lot_number, title: l.title })) || []
    })

    // Start worker processes (in a real deployment, this would use PM2 or similar)
    // For development, we'll start them as background processes
    try {
      const appRoot = process.cwd()
      const auctionTimerWorker = path.resolve(appRoot, 'workers', 'auction-timer.ts')
      const biddingBotsWorker = path.resolve(appRoot, 'workers', 'bidding-bots.ts')

      const auctionTimerCommand = process.platform === 'win32'
        ? `start /B "" tsx "${auctionTimerWorker}"`
        : `nohup tsx "${auctionTimerWorker}" > /tmp/auction-timer.log 2>&1 &`
      const biddingBotsCommand = process.platform === 'win32'
        ? `start /B "" tsx "${biddingBotsWorker}"`
        : `nohup tsx "${biddingBotsWorker}" > /tmp/bidding-bots.log 2>&1 &`

      execAsync(auctionTimerCommand, { cwd: appRoot })
        .catch(err => console.warn('Could not start auction timer:', err))

      execAsync(biddingBotsCommand, { cwd: appRoot })
        .catch(err => console.warn('Could not start bidding bots:', err))
    } catch (err) {
      console.warn('Worker processes may not have started:', err)
    }

    // Update demo state
    demoState.start(runId)

    return NextResponse.json({
      success: true,
      message: 'Demo started successfully (using existing data)',
      run_id: runId,
      existing_data: {
        auctions: allAuctions?.length || 0,
        sample_lots: sampleLots?.length || 0,
        note: 'Demo is simulated with existing auction data. Schema migration needed for full functionality.'
      }
    })

  } catch (error) {
    console.error('Start demo error:', error)
    return NextResponse.json(
      { error: 'Failed to start demo: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

async function stopDemo(supabase: any, demoState: DemoState) {
  try {
    // Stop auction timers by ending all live lots
    await supabase
      .from('lots')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        ended_reason: 'Demo stopped'
      })
      .eq('demo_label', DEMO.DEMO_LABEL)
      .eq('status', 'live')

    // End all live auctions
    await supabase
      .from('auctions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString()
      })
      .eq('demo_label', DEMO.DEMO_LABEL)
      .eq('status', 'live')

    // Kill worker processes (in production, would use PM2)
    try {
      await execAsync('pkill -f "auction-timer.ts"').catch(() => {})
      await execAsync('pkill -f "bidding-bots.ts"').catch(() => {})
    } catch (err) {
      console.warn('Could not kill worker processes:', err)
    }

    // Update demo state
    demoState.stop()

    return NextResponse.json({
      success: true,
      message: 'Demo stopped successfully'
    })

  } catch (error) {
    console.error('Stop demo error:', error)
    return NextResponse.json(
      { error: 'Failed to stop demo: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

async function resetDemo(supabase: any, demoState: DemoState) {
  try {
    // Stop demo first
    if (demoState.isRunning) {
      await stopDemo(supabase, demoState)
    }

    const runId = generateDemoRunId()

    console.log('Demo reset: Starting with existing data...', {
      run_id: runId
    })

    // For now, just work with existing data since we can't run the seeding script
    // In the future, this would seed new demo data

    // Check what data we have
    const { data: existingAuctions, error: checkError } = await supabase
      .from('auctions')
      .select('id, title, status')
      .limit(5)

    if (checkError) {
      console.error('Demo reset: Failed to check existing data', {
        error: checkError.message,
        details: checkError.details
      })
      throw new Error('Failed to check existing data: ' + checkError.message)
    }

    console.log('Demo reset: Found existing auctions', {
      auction_count: existingAuctions?.length || 0,
      auctions: existingAuctions?.map(a => ({ id: a.id, title: a.title, status: a.status })) || []
    })

    // Update demo state
    demoState.stop() // Reset state

    return NextResponse.json({
      success: true,
      message: 'Demo reset completed - using existing auction data',
      run_id: runId,
      existing_data: {
        auctions: existingAuctions?.length || 0,
        note: 'Working with existing data since seeding script unavailable'
      }
    })

  } catch (error) {
    console.error('Reset demo error:', error)
    return NextResponse.json(
      { error: 'Failed to reset demo: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  if (!DEMO.ENABLED) {
    return NextResponse.json(
      { error: 'Demo mode is not enabled' },
      { status: 400 }
    )
  }

  const demoState = DemoState.getInstance()

  return NextResponse.json({
    enabled: DEMO.ENABLED,
    running: demoState.isRunning,
    run_id: demoState.runId,
    uptime: demoState.getUptime(),
    start_time: demoState.startTime?.toISOString(),
    config: {
      lot_duration: DEMO.LOT_DURATION_SEC,
      bot_count: DEMO.NUM_BOT_BIDDERS,
      auction_count: DEMO.NUM_AUCTIONEERS,
      lots_per_auction: DEMO.LOTS_PER_AUCTION
    }
  })
}
