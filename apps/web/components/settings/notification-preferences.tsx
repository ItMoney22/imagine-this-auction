'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Bell, Mail, MessageSquare, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface NotificationPreferences {
  email: boolean
  push: boolean
  sms: boolean
  quiet_hours: [number, number]
}

interface NotificationPreferencesProps {
  user: any
  initialPreferences: NotificationPreferences
}

export function NotificationPreferences({ user, initialPreferences }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    initialPreferences || {
      email: true,
      push: true,
      sms: false,
      quiet_hours: [22, 7]
    }
  )
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const savePreferences = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ notification_prefs: preferences })
        .eq('id', user.id)

      if (error) throw error

      toast.success('Notification preferences saved!')
    } catch (error) {
      toast.error('Failed to save preferences')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  const updatePreference = (key: keyof NotificationPreferences, value: any) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const quietHoursOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, '0')}:00`
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Choose how and when you want to receive auction notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Notification Types */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Notification Types</h3>

          <div className="space-y-4">
            {/* Email Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">Email Notifications</div>
                  <div className="text-sm text-gray-500">
                    Daily digest and important auction alerts
                  </div>
                </div>
              </div>
              <Switch
                checked={preferences.email}
                onCheckedChange={(checked) => updatePreference('email', checked)}
              />
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">Push Notifications</div>
                  <div className="text-sm text-gray-500">
                    Real-time alerts for ending soon and interest matches
                  </div>
                </div>
              </div>
              <Switch
                checked={preferences.push}
                onCheckedChange={(checked) => updatePreference('push', checked)}
              />
            </div>

            {/* SMS Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg opacity-50">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">SMS Notifications</div>
                  <div className="text-sm text-gray-500">
                    High-priority alerts via text message (Coming Soon)
                  </div>
                </div>
              </div>
              <Switch
                checked={preferences.sms}
                onCheckedChange={(checked) => updatePreference('sms', checked)}
                disabled
              />
            </div>
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Quiet Hours
          </h3>
          <p className="text-sm text-gray-500">
            Set hours when you don't want to receive notifications (except critical alerts)
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">Start Time</Label>
              <Select
                value={preferences.quiet_hours[0].toString()}
                onValueChange={(value) =>
                  updatePreference('quiet_hours', [parseInt(value), preferences.quiet_hours[1]])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quietHoursOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quiet-end">End Time</Label>
              <Select
                value={preferences.quiet_hours[1].toString()}
                onValueChange={(value) =>
                  updatePreference('quiet_hours', [preferences.quiet_hours[0], parseInt(value)])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quietHoursOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
            <strong>Note:</strong> Quiet hours are {preferences.quiet_hours[0]}:00 to {preferences.quiet_hours[1]}:00.
            {preferences.quiet_hours[0] > preferences.quiet_hours[1] &&
              ' This spans midnight (overnight quiet period).'
            }
          </div>
        </div>

        {/* Frequency Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Notification Frequency</h3>

          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex justify-between items-center">
              <span>Daily recommendations:</span>
              <span className="font-medium">Once per day</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Interest matches:</span>
              <span className="font-medium">When lots are published</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Ending soon alerts:</span>
              <span className="font-medium">24 hours before close</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={savePreferences}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}