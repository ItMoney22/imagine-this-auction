import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { NotificationPreferences } from '@/components/settings/notification-preferences'
import { InterestTags } from '@/components/settings/interest-tags'
import { PushNotificationSettings } from '@/components/settings/push-notification-settings'
import { NotificationHistory } from '@/components/settings/notification-history'

export default async function NotificationSettingsPage() {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Get user profile and preferences
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    return notFound()
  }

  // Get user interests
  const { data: userInterests } = await supabase
    .from('user_interests')
    .select('*')
    .eq('user_id', user.id)
    .order('weight', { ascending: false })

  // Get user device tokens
  const { data: deviceTokens } = await supabase
    .from('user_device_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)

  // Get recent notifications
  const { data: recentNotifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Get available categories for interest selection
  const { data: availableCategories } = await supabase
    .from('lots')
    .select('category')
    .not('category', 'is', null)
    .order('category')

  const uniqueCategories = Array.from(
    new Set(availableCategories?.map(c => c.category).filter(Boolean))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Notification Settings
          </h1>
          <p className="text-gray-600">
            Customize your auction notifications and preferences
          </p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-8">
          {/* Notification Preferences */}
          <NotificationPreferences
            user={userProfile}
            initialPreferences={userProfile.notification_prefs}
          />

          {/* Push Notification Settings */}
          <PushNotificationSettings
            userId={user.id}
            deviceTokens={deviceTokens || []}
          />

          {/* Interest Tags */}
          <InterestTags
            userId={user.id}
            userInterests={userInterests || []}
            availableCategories={uniqueCategories}
          />

          {/* Notification History */}
          <NotificationHistory
            notifications={recentNotifications || []}
          />
        </div>
      </div>
    </div>
  )
}