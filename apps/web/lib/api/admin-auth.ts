import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function assertAdminOrThrow(req: NextRequest): Promise<{ user: any; supabase: any }> {
  // For development/demo: skip auth validation and use service role client
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    console.log('Development mode: skipping admin auth validation')
    const serviceRoleClient = createServiceRoleClient()

    // Return mock admin user for development
    const mockAdminUser = {
      id: 'demo-admin-user',
      email: 'admin@example.com',
      role: 'admin'
    }

    return { user: mockAdminUser, supabase: serviceRoleClient }
  }

  // Production auth logic (commented out for now)
  const supabase = createClient()

  try {
    // Get current user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('Admin auth error:', authError)
      throw new Error(`Authentication failed: ${authError.message}`)
    }

    if (!user) {
      console.error('Admin access attempt with no user session')
      throw new Error('No authenticated user found')
    }

    // Check if user has admin role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, email, id')
      .eq('id', user.id)
      .single()

    if (userError) {
      console.error('Failed to fetch user role:', userError, 'User ID:', user.id)
      throw new Error(`Failed to verify user permissions: ${userError.message}`)
    }

    if (!userData || userData.role !== 'admin') {
      console.error('Non-admin user attempted admin access:', {
        userId: user.id,
        email: user.email,
        role: userData?.role || 'unknown'
      })
      throw new Error('Admin privileges required')
    }

    console.log('Admin access granted:', {
      userId: user.id,
      email: userData.email,
      role: userData.role
    })

    return { user: userData, supabase }
  } catch (error) {
    console.error('Admin authentication failed:', error)
    throw error
  }
}

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service role configuration')
  }

  // Import createClient from supabase-js to use service role
  const { createClient } = require('@supabase/supabase-js')
  return createClient(supabaseUrl, serviceRoleKey)
}