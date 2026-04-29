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

    // Build query with filters
    let query = supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        first_name,
        last_name,
        phone,
        is_approved,
        created_at,
        updated_at,
        auctioneer:auctioneers(
          id,
          company_name,
          is_approved,
          created_at
        )
      `)

    // Apply filters
    const role = searchParams.get('role')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    if (role && role !== 'all') {
      query = query.eq('role', role)
    }

    if (status === 'active') {
      query = query.eq('is_approved', true)
    } else if (status === 'suspended') {
      query = query.eq('is_approved', false)
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
    }

    const { data: users, error: usersError } = await query
      .order('created_at', { ascending: false })
      .limit(100)

    if (usersError) {
      console.error('Failed to fetch users:', usersError)
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    return NextResponse.json({ users })

  } catch (error) {
    console.error('Admin users API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
