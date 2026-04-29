import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEMO } from '@/config/demo'

/**
 * Demo Summary API
 *
 * Provides comprehensive statistics and data overview for demo mode.
 * Used for debugging and monitoring demo state.
 */

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  if (!DEMO.ENABLED) {
    console.error('Demo summary requested but demo mode disabled', {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
      DEMO_ENABLED: DEMO.ENABLED
    })
    return NextResponse.json(
      { error: 'Demo mode is not enabled' },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()

    console.log('Demo summary: Starting data collection', {
      demo_label: DEMO.DEMO_LABEL,
      config: {
        NUM_AUCTIONEERS: DEMO.NUM_AUCTIONEERS,
        AUCTIONS_PER_AUCTIONEER: DEMO.AUCTIONS_PER_AUCTIONEER,
        LOTS_PER_AUCTION: DEMO.LOTS_PER_AUCTION,
        NUM_BOT_BIDDERS: DEMO.NUM_BOT_BIDDERS
      }
    })

    // Get comprehensive demo statistics using existing schema
    // Note: Using title field to identify demo data since demo_label column may not exist
    const demoIdentifier = DEMO.DEMO_LABEL

    const [
      auctionsResult,
      lotsResult,
      usersResult,
      bidsResult,
      activeLots,
      liveAuctions
    ] = await Promise.all([
      // Get all auctions for now since demo_label doesn't exist yet
      supabase
        .from('auctions')
        .select('id, status, created_at, title, description'),

      supabase
        .from('lots')
        .select('id, lot_number, title, current_high_bid'),

      supabase
        .from('users')
        .select('id, first_name, email')
        .or('email.ilike.%demo%,email.ilike.%bot%'),

      supabase
        .from('bids')
        .select('id, amount, created_at'),

      // For now, return empty since we don't have lot status
      Promise.resolve({ data: [], error: null }),

      // Check for any auctions with demo in title
      supabase
        .from('auctions')
        .select('id, status, title')
        .ilike('title', '%demo%')
        .eq('status', 'live')
    ])

    // Log any errors from queries
    const errors = []
    if (auctionsResult.error) {
      console.error('Demo summary: Auctions query error', {
        error: auctionsResult.error.message,
        details: auctionsResult.error.details,
        hint: auctionsResult.error.hint
      })
      errors.push(`Auctions: ${auctionsResult.error.message}`)
    }

    if (lotsResult.error) {
      console.error('Demo summary: Lots query error', {
        error: lotsResult.error.message,
        details: lotsResult.error.details,
        hint: lotsResult.error.hint
      })
      errors.push(`Lots: ${lotsResult.error.message}`)
    }

    if (usersResult.error) {
      console.error('Demo summary: Users query error', {
        error: usersResult.error.message,
        details: usersResult.error.details,
        hint: usersResult.error.hint
      })
      errors.push(`Users: ${usersResult.error.message}`)
    }

    if (bidsResult.error) {
      console.error('Demo summary: Bids query error', {
        error: bidsResult.error.message,
        details: bidsResult.error.details,
        hint: bidsResult.error.hint
      })
      errors.push(`Bids: ${bidsResult.error.message}`)
    }

    if (activeLots.error) {
      console.error('Demo summary: Active lots query error', {
        error: activeLots.error.message,
        details: activeLots.error.details,
        hint: activeLots.error.hint
      })
      errors.push(`Active lots: ${activeLots.error.message}`)
    }

    if (liveAuctions.error) {
      console.error('Demo summary: Live auctions query error', {
        error: liveAuctions.error.message,
        details: liveAuctions.error.details,
        hint: liveAuctions.error.hint
      })
      errors.push(`Live auctions: ${liveAuctions.error.message}`)
    }

    // Process successful data
    const auctions = auctionsResult.data || []
    const lots = lotsResult.data || []
    const users = usersResult.data || []
    const bids = bidsResult.data || []

    // Calculate statistics (using existing schema field names)
    const botUsers = users.filter(u => u.email?.includes('bot'))
    const humanUsers = users.filter(u => !u.email?.includes('bot'))
    const totalVolume = bids.reduce((sum, bid) => sum + (bid.amount || 0), 0)

    const summary = {
      config: {
        demo_label: DEMO.DEMO_LABEL,
        enabled: DEMO.ENABLED,
        lot_duration_sec: DEMO.LOT_DURATION_SEC,
        num_bot_bidders: DEMO.NUM_BOT_BIDDERS,
        bot_strategies: DEMO.BOT_STRATEGIES
      },
      counts: {
        auctions: auctions.length,
        lots: lots.length,
        users: users.length,
        bots: botUsers.length,
        humans: humanUsers.length,
        bids: bids.length,
        active_lots: activeLots.data?.length || 0,
        live_auctions: liveAuctions.data?.length || 0
      },
      status_breakdown: {
        auctions: auctions.reduce((acc, a) => {
          acc[a.status] = (acc[a.status] || 0) + 1
          return acc
        }, {} as Record<string, number>),
        lots: { total: lots.length }
      },
      financial: {
        total_bids: bids.length,
        total_volume_itc: totalVolume,
        avg_bid_itc: bids.length > 0 ? totalVolume / bids.length : 0
      },
      sample_data: {
        lots: lots.slice(0, 10),
        active_lots: activeLots.data?.slice(0, 5) || [],
        recent_bids: bids.slice(-5)
      },
      errors: errors.length > 0 ? errors : null,
      timestamp: new Date().toISOString()
    }

    console.log('Demo summary generated successfully', {
      counts: summary.counts,
      errors: summary.errors
    })

    return NextResponse.json(summary)

  } catch (error) {
    console.error('Demo summary: Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      demo_config: {
        DEMO_LABEL: DEMO.DEMO_LABEL,
        ENABLED: DEMO.ENABLED
      }
    })

    return NextResponse.json(
      {
        error: 'Failed to generate demo summary',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
