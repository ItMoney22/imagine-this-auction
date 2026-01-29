import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const StatusChangeSchema = z.object({
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
    const validation = StatusChangeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { is_approved, notes } = validation.data

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

    // const { data: adminUser, error: adminError } = await supabase
    //   .from('users')
    //   .select('role')
    //   .eq('id', user.id)
    //   .single()

    // if (adminError || !adminUser || adminUser.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: 'Admin access required' },
    //     { status: 403 }
    //   )
    // }

    // Prevent self-suspension (commented out for development)
    // if (user.id === params.id && !is_approved) {
    //   return NextResponse.json(
    //     { error: 'Cannot suspend your own account' },
    //     { status: 400 }
    //   )
    // }

    // Call the database function to change status (using dummy admin ID for development)
    const { data: result, error: statusError } = await supabase
      .rpc('change_user_status', {
        p_admin_id: 'dev-admin-id', // dummy admin ID for development
        p_target_user_id: id,
        p_is_approved: is_approved,
        p_notes: notes || null,
      })

    if (statusError) {
      console.error('Failed to change user status:', statusError)
      return NextResponse.json(
        { error: 'Failed to change user status' },
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
      message: `User ${is_approved ? 'unsuspended' : 'suspended'} successfully`,
      old_status: result.old_status,
      new_status: result.new_status,
      user_email: result.user_email,
    })

  } catch (error) {
    console.error('Status change API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}