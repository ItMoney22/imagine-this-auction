import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const UpdateAnnouncementSchema = z.object({
  is_active: z.boolean().optional(),
  expires_at: z.string().optional(),
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
    const validation = UpdateAnnouncementSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const updates = validation.data

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

    // Get current announcement
    const { data: currentAnnouncement, error: fetchError } = await supabase
      .from('system_announcements')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentAnnouncement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      )
    }

    // Update announcement
    const { data: updatedAnnouncement, error: updateError } = await supabase
      .from('system_announcements')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Failed to update announcement:', updateError)
      return NextResponse.json(
        { error: 'Failed to update announcement' },
        { status: 500 }
      )
    }

    // Log the action (using dummy admin ID for development)
    const action = updates.is_active === false ? 'announcement_deactivated' : 'announcement_updated'
    await supabase.rpc('log_admin_action', {
      p_admin_id: 'dev-admin-id', // dummy admin ID for development
      p_action: action,
      p_target_type: 'announcement',
      p_target_id: params.id,
      p_before_values: {
        is_active: currentAnnouncement.is_active,
        expires_at: currentAnnouncement.expires_at,
      },
      p_after_values: updates,
    })

    return NextResponse.json({
      success: true,
      announcement: updatedAnnouncement,
      message: 'Announcement updated successfully',
    })

  } catch (error) {
    console.error('Update announcement API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()

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

    // Get announcement before deletion for audit log
    const { data: announcement, error: fetchError } = await supabase
      .from('system_announcements')
      .select('title, severity, target_roles')
      .eq('id', id)
      .single()

    if (fetchError || !announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      )
    }

    // Delete announcement
    const { error: deleteError } = await supabase
      .from('system_announcements')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Failed to delete announcement:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete announcement' },
        { status: 500 }
      )
    }

    // Log the action (using dummy admin ID for development)
    await supabase.rpc('log_admin_action', {
      p_admin_id: 'dev-admin-id', // dummy admin ID for development
      p_action: 'announcement_deleted',
      p_target_type: 'announcement',
      p_target_id: params.id,
      p_before_values: announcement,
    })

    return NextResponse.json({
      success: true,
      message: 'Announcement deleted successfully',
    })

  } catch (error) {
    console.error('Delete announcement API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}