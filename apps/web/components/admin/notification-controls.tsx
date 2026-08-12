'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Send, TestTube, Zap, Mail, Bell } from 'lucide-react'
import { toast } from 'sonner'

export function NotificationControls() {
  const [loading, setLoading] = useState(false)
  const [testUser, setTestUser] = useState('')
  const [dryRun, setDryRun] = useState(true)

  const triggerDailyRecommendations = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/edge-functions/recommend-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: testUser || undefined,
          trigger: 'manual'
        })
      })

      const result = await response.json()

      if (result.success) {
        toast.success(`Recommendations triggered! Processed ${result.processed_users} users, queued ${result.notifications_queued} notifications`)
      } else {
        toast.error(result.error || 'Failed to trigger recommendations')
      }
    } catch (error) {
      toast.error('Failed to trigger recommendations')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const deliverEmailBatch = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/notifications/deliver-email-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: testUser || undefined,
          dry_run: dryRun,
          limit: 50
        })
      })

      const result = await response.json()

      if (result.success) {
        const message = dryRun
          ? `[DRY RUN] Would send ${result.processed} emails`
          : `Sent ${result.successful} emails, ${result.failed} failed`
        toast.success(message)
      } else {
        toast.error(result.error || 'Failed to deliver emails')
      }
    } catch (error) {
      toast.error('Failed to deliver emails')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const deliverPushBatch = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: testUser || undefined,
          dry_run: dryRun,
          limit: 50
        })
      })

      const result = await response.json()

      if (result.success) {
        const message = dryRun
          ? `[DRY RUN] Would send ${result.processed} push notifications`
          : `Sent ${result.successful} push notifications, ${result.failed} failed`
        toast.success(message)
      } else {
        toast.error(result.error || 'Failed to deliver push notifications')
      }
    } catch (error) {
      toast.error('Failed to deliver push notifications')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const testCopywriter = async () => {
    setLoading(true)
    try {
      // Health check: confirms provider, model, and API key configuration
      const response = await fetch('/api/ai/copywriter')

      const result = await response.json()

      if (response.ok && result.status === 'healthy') {
        toast.success(
          `Copywriter healthy — ${result.provider} (${result.model}), API key ${result.api_key_configured ? 'configured' : 'MISSING'}`
        )
      } else {
        toast.error(result.error || 'Copywriter health check failed')
      }
    } catch (error) {
      toast.error('Failed to test copywriter')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Notification Controls
        </CardTitle>
        <CardDescription>
          Manually trigger notification processes and test system components
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Test Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="space-y-2">
            <Label htmlFor="test-user">Test User ID (optional)</Label>
            <Input
              id="test-user"
              placeholder="Leave empty for all users"
              value={testUser}
              onChange={(e) => setTestUser(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Dry Run Mode</Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
              <span className="text-sm text-gray-600">
                {dryRun ? 'Enabled (no actual sending)' : 'Disabled (real sending)'}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Badge variant={dryRun ? 'secondary' : 'destructive'}>
              {dryRun ? 'Test Mode' : 'Live Mode'}
            </Badge>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            onClick={triggerDailyRecommendations}
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Trigger Recommendations
          </Button>

          <Button
            onClick={deliverEmailBatch}
            disabled={loading}
            variant="outline"
            className="flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Deliver Emails
          </Button>

          <Button
            onClick={deliverPushBatch}
            disabled={loading}
            variant="outline"
            className="flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Deliver Push
          </Button>

          <Button
            onClick={testCopywriter}
            disabled={loading}
            variant="outline"
            className="flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
            Test Copywriter
          </Button>
        </div>

        {/* Status Messages */}
        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
          <p className="font-medium mb-1">Usage Notes:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Recommendations are normally triggered daily via cron job</li>
            <li>Email and push delivery process queued notifications</li>
            <li>Use test mode to validate without sending real notifications</li>
            <li>Specify a user ID to test with a specific user</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}