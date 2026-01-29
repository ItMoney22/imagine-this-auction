import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin or the auctioneer
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if auction exists and user has permission
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select(`
        *,
        auctioneer:auctioneers!inner(user_id)
      `)
      .eq('id', params.id)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // Check permission: admin or auction owner
    if (userData.role !== 'admin' && auction.auctioneer.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if auction is in a state that can be closed
    if (auction.status !== 'live' && auction.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Auction cannot be closed in current state' },
        { status: 400 }
      )
    }

    // Check if auction end time has passed (for live auctions)
    if (auction.status === 'live' && new Date() < new Date(auction.ends_at)) {
      return NextResponse.json(
        { error: 'Cannot close auction before end time' },
        { status: 400 }
      )
    }

    // Call the database function to process auction end
    const { data: result, error: processError } = await supabase
      .rpc('process_auction_end', { auction_uuid: params.id })

    if (processError) {
      console.error('Failed to process auction end:', processError)
      return NextResponse.json(
        { error: 'Failed to process auction end' },
        { status: 500 }
      )
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process auction end' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Auction closed successfully',
      processed_lots: result.processed_lots,
    })

  } catch (error) {
    console.error('Auction close API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}