import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { NotificationBatches } from '@/components/admin/notification-batches'
import { NotificationStats } from '@/components/admin/notification-stats'
import { HypePreview } from '@/components/admin/hype-preview'
import { NotificationControls } from '@/components/admin/notification-controls'

export default async function AdminNotificationsPage() {
  const supabase = await createClient()

  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return notFound()
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'admin') {
    return notFound()
  }

  // Get notification statistics
  const [
    { data: batchStats },
    { data: recentBatches },
    { data: pendingNotifications },
    { data: lotsWithHype },
    { data: featureFlags }
  ] = await Promise.all([
    // Batch statistics
    supabase
      .from('notification_batches')
      .select('batch_type, status, sent_count, failed_count, created_at')
      .order('created_at', { ascending: false })
      .limit(20),

    // Recent batches
    supabase
      .from('notification_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),

    // Pending notifications count
    supabase
      .from('notifications')
      .select('type, count()', { count: 'exact' })
      .eq('status', 'pending'),

    // Lots with hype copy for preview
    supabase
      .from('lots')
      .select(`
        id, title, description, category, hype_copy,
        auctions!inner(id, title, status)
      `)
      .not('hype_copy', 'is', null)
      .eq('auctions.status', 'live')
      .order('created_at', { ascending: false })
      .limit(5),

    // Feature flags
    supabase
      .from('feature_flags')
      .select('*')
      .order('flag_name')
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Notification Management
          </h1>
          <p className="text-gray-600">
            Monitor and control AI-powered auction notifications
          </p>
        </div>

        {/* Quick Stats */}
        <NotificationStats
          batchStats={batchStats || []}
          pendingNotifications={pendingNotifications || []}
          featureFlags={featureFlags || []}
        />

        {/* Control Panel */}
        <div className="mb-8">
          <NotificationControls />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Notification Batches */}
          <div className="space-y-6">
            <NotificationBatches batches={recentBatches || []} />
          </div>

          {/* Hype Copy Preview */}
          <div className="space-y-6">
            <HypePreview lots={lotsWithHype || []} />
          </div>
        </div>
      </div>
    </div>
  )
}