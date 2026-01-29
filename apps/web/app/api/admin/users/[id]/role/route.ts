import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const RoleChangeSchema = z.object({
  new_role: z.enum(['bidder', 'auctioneer', 'admin']),
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
    const validation = RoleChangeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { new_role, notes } = validation.data

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

    // Prevent self-role change from admin (commented out for development)
    // if (user.id === params.id && new_role !== 'admin') {
    //   return NextResponse.json(
    //     { error: 'Cannot remove admin role from yourself' },
    //     { status: 400 }
    //   )
    // }

    // Call the database function to change role (using dummy admin ID for development)
    const { data: result, error: roleError } = await supabase
      .rpc('change_user_role', {
        p_admin_id: 'dev-admin-id', // dummy admin ID for development
        p_target_user_id: id,
        p_new_role: new_role,
        p_notes: notes || null,
      })

    if (roleError) {
      console.error('Failed to change user role:', roleError)
      return NextResponse.json(
        { error: 'Failed to change user role' },
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
      message: `User role changed from ${result.old_role} to ${result.new_role}`,
      old_role: result.old_role,
      new_role: result.new_role,
      user_email: result.user_email,
    })

  } catch (error) {
    console.error('Role change API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}