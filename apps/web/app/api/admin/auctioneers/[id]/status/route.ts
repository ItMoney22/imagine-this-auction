import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const AuctioneerStatusSchema = z.object({
  is_approved: z.boolean(),
  notes: z.string().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const body = await request.json()

    // Validate request body
    const validation = AuctioneerStatusSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { is_approved, notes } = validation.data

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

    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (adminError || !adminUser || adminUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { data: result, error: statusError } = await supabase
      .rpc('change_auctioneer_status', {
        p_admin_id: user.id,
        p_auctioneer_id: id,
        p_is_approved: is_approved,
        p_notes: notes || null,
      })

    if (statusError) {
      console.error('Failed to change auctioneer status:', statusError)
      return NextResponse.json(
        { error: 'Failed to change auctioneer status' },
        { status: 500 }
      )
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Auctioneer ${is_approved ? 'approved' : 'rejected'} successfully`,
      old_status: result.old_status,
      new_status: result.new_status,
      company_name: result.company_name,
    })

  } catch (error) {
    console.error('Auctioneer status change API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
