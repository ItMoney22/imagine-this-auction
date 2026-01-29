import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // TEMPORARY: Skip auth for development
    // Check authentication and admin role
    // const {
    //   data: { user },
    //   error: authError,
    // } = await supabase.auth.getUser()

    // if (authError || !user) {
    //   return NextResponse.json(
    //     { error: 'Authentication required' },
    //     { status: 401 }
    //   )
    // }

    // const { data: userData, error: userError } = await supabase
    //   .from('users')
    //   .select('role')
    //   .eq('id', user.id)
    //   .single()

    // if (userError || !userData || userData.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: 'Admin access required' },
    //     { status: 403 }
    //   )
    // }

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

    // Get performance stats for each auctioneer
    const auctioneersWithStats = await Promise.all(
      auctioneers.map(async (auctioneer) => {
        // Get auction count and revenue
        const { data: auctionStats } = await supabase
          .from('auctions')
          .select('id, status')
          .eq('auctioneer_id', auctioneer.id)

        // Get total commission owed
        const { data: commissionData } = await supabase
          .from('payouts_due')
          .select('amount, is_paid')
          .eq('auctioneer_id', auctioneer.id)

        const totalAuctions = auctionStats?.length || 0
        const completedAuctions = auctionStats?.filter(a => a.status === 'ended' || a.status === 'completed').length || 0
        const totalCommissionOwed = commissionData?.filter(p => !p.is_paid).reduce((sum, p) => sum + p.amount, 0) || 0
        const totalCommissionPaid = commissionData?.filter(p => p.is_paid).reduce((sum, p) => sum + p.amount, 0) || 0

        return {
          ...auctioneer,
          stats: {
            total_auctions: totalAuctions,
            completed_auctions: completedAuctions,
            commission_owed: totalCommissionOwed,
            commission_paid: totalCommissionPaid,
          }
        }
      })
    )

    return NextResponse.json({ auctioneers: auctioneersWithStats })

  } catch (error) {
    console.error('Admin auctioneers API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}