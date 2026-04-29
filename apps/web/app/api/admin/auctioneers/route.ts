import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

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

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !userData || userData.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Build query with comprehensive auctioneer data
    let query = supabase
      .from('auctioneers')
      .select(`
        id,
        user_id,
        company_name,
        business_license,
        tax_id,
        address_line1,
        address_line2,
        city,
        state,
        zip_code,
        website,
        logo_url,
        is_approved,
        approval_date,
        created_at,
        updated_at,
        user:users!user_id(
          id,
          email,
          first_name,
          last_name,
          phone,
          is_approved,
          created_at
        )
      `)

    // Apply filters
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    if (status === 'pending') {
      query = query.eq('is_approved', false)
    } else if (status === 'approved') {
      query = query.eq('is_approved', true)
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,business_license.ilike.%${search}%`)
    }

    const { data: auctioneers, error: auctioneersError } = await query
      .order('created_at', { ascending: false })

    if (auctioneersError) {
      console.error('Failed to fetch auctioneers:', auctioneersError)
      return NextResponse.json(
        { error: 'Failed to fetch auctioneers' },
        { status: 500 }
      )
    }

    const auctioneerIds = auctioneers.map((auctioneer) => auctioneer.id)
    const [auctionsResult, payoutsResult] = await Promise.all([
      auctioneerIds.length > 0
        ? supabase
            .from('auctions')
            .select('auctioneer_id, status')
            .in('auctioneer_id', auctioneerIds)
        : Promise.resolve({ data: [], error: null }),
      auctioneerIds.length > 0
        ? supabase
            .from('payouts_due')
            .select('auctioneer_id, amount, is_paid')
            .in('auctioneer_id', auctioneerIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (auctionsResult.error) {
      console.error('Failed to fetch auction statistics:', auctionsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch auction statistics' },
        { status: 500 }
      )
    }

    if (payoutsResult.error) {
      console.error('Failed to fetch payout statistics:', payoutsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch payout statistics' },
        { status: 500 }
      )
    }

    const auctionStatsByAuctioneer = new Map<string, { total: number; completed: number }>()
    for (const auction of auctionsResult.data || []) {
      const current = auctionStatsByAuctioneer.get(auction.auctioneer_id) || {
        total: 0,
        completed: 0,
      }
      current.total += 1
      if (auction.status === 'ended' || auction.status === 'completed') {
        current.completed += 1
      }
      auctionStatsByAuctioneer.set(auction.auctioneer_id, current)
    }

    const payoutStatsByAuctioneer = new Map<string, { owed: number; paid: number }>()
    for (const payout of payoutsResult.data || []) {
      const current = payoutStatsByAuctioneer.get(payout.auctioneer_id) || {
        owed: 0,
        paid: 0,
      }
      if (payout.is_paid) {
        current.paid += payout.amount
      } else {
        current.owed += payout.amount
      }
      payoutStatsByAuctioneer.set(payout.auctioneer_id, current)
    }

    const auctioneersWithStats = auctioneers.map((auctioneer) => {
      const auctionStats = auctionStatsByAuctioneer.get(auctioneer.id) || { total: 0, completed: 0 }
      const payoutStats = payoutStatsByAuctioneer.get(auctioneer.id) || { owed: 0, paid: 0 }

      return {
        ...auctioneer,
        stats: {
          total_auctions: auctionStats.total,
          completed_auctions: auctionStats.completed,
          commission_owed: payoutStats.owed,
          commission_paid: payoutStats.paid,
        }
      }
    })

    return NextResponse.json({ auctioneers: auctioneersWithStats })

  } catch (error) {
    console.error('Admin auctioneers API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
