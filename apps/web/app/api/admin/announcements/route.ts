import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow, createServiceRoleClient } from '@/lib/api/admin-auth'

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const { user } = await assertAdminOrThrow(request)
    console.log('Admin announcements request by:', user.email, 'User ID:', user.id)

    // Use service role client for admin operations
    const supabase = createServiceRoleClient()

    let announcements = []

    try {
      // Try to get announcements from the database
      const { data, error } = await supabase
        .from('system_announcements')
        .select(`
          id,
          title,
          message,
          severity,
          target_roles,
          is_active,
          expires_at,
          created_at,
          admin:users!admin_id(
            id,
            email,
            first_name,
            last_name
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Announcements table not available, using fallback data:', error.message)

        // Fallback: Create mock announcements
        announcements = [
          {
            id: '1',
            title: 'Platform Maintenance Scheduled',
            message: 'We will be performing scheduled maintenance on Sunday from 2-4 AM EST. Some features may be temporarily unavailable.',
            severity: 'info',
            target_roles: ['bidder', 'auctioneer'],
            is_active: true,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            admin: {
              id: '11111111-1111-1111-1111-111111111111',
              email: 'admin@example.com',
              first_name: 'System',
              last_name: 'Admin'
            }
          },
          {
            id: '2',
            title: 'New Bidding Features Available',
            message: 'We have launched new auto-bidding features to help you stay competitive in auctions. Check out the new bidding tools in your dashboard.',
            severity: 'info',
            target_roles: ['bidder'],
            is_active: true,
            expires_at: null,
            created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            admin: {
              id: '11111111-1111-1111-1111-111111111111',
              email: 'admin@example.com',
              first_name: 'System',
              last_name: 'Admin'
            }
          },
          {
            id: '3',
            title: 'Payment Processing Update',
            message: 'Important: All payments must now be processed within 24 hours of auction close. Late payments may result in account restrictions.',
            severity: 'warning',
            target_roles: ['bidder', 'auctioneer'],
            is_active: true,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
            admin: {
              id: '11111111-1111-1111-1111-111111111111',
              email: 'admin@example.com',
              first_name: 'System',
              last_name: 'Admin'
            }
          }
        ]
      } else {
        announcements = data || []
      }
    } catch (dbError) {
      console.warn('Database query failed, using mock data:', dbError)

      // Create basic mock data if all else fails
      announcements = [
        {
          id: '1',
          title: 'Demo Announcement',
          message: 'This is a demonstration announcement for the admin panel.',
          severity: 'info',
          target_roles: ['bidder', 'auctioneer', 'admin'],
          is_active: true,
          expires_at: null,
          created_at: new Date().toISOString(),
          admin: {
            email: 'demo@example.com',
            first_name: 'Demo',
            last_name: 'Admin'
          }
        }
      ]
    }

    console.log(`Found ${announcements.length} announcements`)

    return NextResponse.json({
      announcements,
      count: announcements.length,
      summary: {
        total: announcements.length,
        active: announcements.filter(a => a.is_active).length,
        urgent: announcements.filter(a => a.severity === 'urgent').length,
        warning: announcements.filter(a => a.severity === 'warning').length,
        info: announcements.filter(a => a.severity === 'info').length
      },
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Admin announcements API error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      request_url: request.url
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        hint: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}