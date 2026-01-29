import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

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

    // Get user role
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

    // Build query based on user role
    let query = supabase
      .from('invoices')
      .select(`
        *,
        lot:lots!inner(
          id,
          lot_number,
          title,
          auction:auctions!inner(
            id,
            title,
            auctioneer:auctioneers!inner(
              id,
              company_name,
              user_id
            )
          )
        ),
        buyer:users!buyer_id(
          id,
          first_name,
          last_name,
          email
        )
      `)

    // Filter based on user role and permissions
    if (userData.role === 'bidder') {
      // Bidders can only see their own invoices
      query = query.eq('buyer_id', user.id)
    } else if (userData.role === 'auctioneer') {
      // Auctioneers can see invoices for their auctions
      query = query.eq('lot.auction.auctioneer.user_id', user.id)
    }
    // Admins can see all invoices (no additional filter)

    // Apply filters from query params
    const status = searchParams.get('status')
    const shipped = searchParams.get('shipped')
    const paid = searchParams.get('paid')

    if (status === 'escrow') {
      query = query.eq('is_paid', true).eq('is_shipped', false)
    } else if (status === 'shipped') {
      query = query.eq('is_shipped', true)
    } else if (status === 'pending') {
      query = query.eq('is_paid', false)
    }

    if (shipped === 'true') {
      query = query.eq('is_shipped', true)
    } else if (shipped === 'false') {
      query = query.eq('is_shipped', false)
    }

    if (paid === 'true') {
      query = query.eq('is_paid', true)
    } else if (paid === 'false') {
      query = query.eq('is_paid', false)
    }

    const { data: invoices, error: invoicesError } = await query
      .order('created_at', { ascending: false })

    if (invoicesError) {
      console.error('Failed to fetch invoices:', invoicesError)
      return NextResponse.json(
        { error: 'Failed to fetch invoices' },
        { status: 500 }
      )
    }

    return NextResponse.json({ invoices })

  } catch (error) {
    console.error('Invoices API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}