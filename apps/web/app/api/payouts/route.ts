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

    // Check if user is admin or auctioneer
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
      .from('payouts_due')
      .select(`
        *,
        auctioneer:auctioneers!inner(
          id,
          company_name,
          user_id
        ),
        invoice:invoices!inner(
          id,
          hammer_price,
          buyer_premium_amount,
          total_amount,
          lot:lots!inner(
            id,
            lot_number,
            title,
            auction:auctions!inner(
              id,
              title
            )
          )
        )
      `)

    // Filter based on user role
    if (userData.role === 'auctioneer') {
      // Auctioneers can only see their own payouts
      query = query.eq('auctioneer.user_id', user.id)
    } else if (userData.role !== 'admin') {
      // Only admins and auctioneers can access payouts
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Apply filters from query params
    const status = searchParams.get('status')
    if (status === 'pending') {
      query = query.eq('is_paid', false)
    } else if (status === 'paid') {
      query = query.eq('is_paid', true)
    }

    const { data: payouts, error: payoutsError } = await query
      .order('created_at', { ascending: false })

    if (payoutsError) {
      console.error('Failed to fetch payouts:', payoutsError)
      return NextResponse.json(
        { error: 'Failed to fetch payouts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ payouts })

  } catch (error) {
    console.error('Payouts API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { payout_id, payment_reference } = body

    // Check authentication and admin role
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

    const { data: payout, error: updateError } = await supabase
      .from('payouts_due')
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_reference,
      })
      .eq('id', payout_id)
      .eq('is_paid', false)
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error('Failed to update payout:', updateError)
      return NextResponse.json(
        { error: 'Failed to mark payout as paid' },
        { status: 500 }
      )
    }

    if (!payout) {
      return NextResponse.json(
        { error: 'Payout not found or already paid' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Payout marked as paid',
    })

  } catch (error) {
    console.error('Payout update API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
