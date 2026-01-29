'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Announcement {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'urgent'
  target_roles: string[]
  is_active: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
  admin: {
    email: string
    first_name: string | null
    last_name: string | null
  }
}

interface AnnouncementForm {
  title: string
  message: string
  severity: 'info' | 'warning' | 'urgent'
  target_roles: string[]
  expires_at: string
}

export default function NotificationManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState<AnnouncementForm>({
    title: '',
    message: '',
    severity: 'info',
    target_roles: ['bidder', 'auctioneer'],
    expires_at: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/announcements')
      if (!response.ok) throw new Error('Failed to fetch announcements')

      const data = await response.json()
      setAnnouncements(data.announcements || [])
    } catch (error) {
      console.error('Error fetching announcements:', error)
    } finally {
      setLoading(false)
    }
  }

  const createAnnouncement = async () => {
    try {
      setSubmitting(true)

      const payload = {
        title: form.title,
        message: form.message,
        severity: form.severity,
        target_roles: form.target_roles,
        expires_at: form.expires_at || undefined,
      }

      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create announcement')
      }

      // Reset form and refresh list
      setForm({
        title: '',
        message: '',
        severity: 'info',
        target_roles: ['bidder', 'auctioneer'],
        expires_at: '',
      })
      setShowCreateForm(false)
      await fetchAnnouncements()

    } catch (error) {
      console.error('Error creating announcement:', error)
      alert(error instanceof Error ? error.message : 'Failed to create announcement')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleAnnouncementStatus = async (announcementId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/announcements/${announcementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update announcement')
      }

      await fetchAnnouncements()
    } catch (error) {
      console.error('Error updating announcement:', error)
      alert(error instanceof Error ? error.message : 'Failed to update announcement')
    }
  }

  const deleteAnnouncement = async (announcementId: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return

    try {
      const response = await fetch(`/api/admin/announcements/${announcementId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete announcement')
      }

      await fetchAnnouncements()
    } catch (error) {
      console.error('Error deleting announcement:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete announcement')
    }
  }

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'urgent': return 'destructive'
      case 'warning': return 'secondary'
      case 'info': return 'default'
      default: return 'outline'
    }
  }

  const formatUserName = (user: { first_name: string | null; last_name: string | null }) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return 'Admin'
  }

  const handleRoleToggle = (role: string) => {
    const newRoles = form.target_roles.includes(role)
      ? form.target_roles.filter(r => r !== role)
      : [...form.target_roles, role]
    setForm({ ...form, target_roles: newRoles })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading announcements...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>System Announcements</CardTitle>
              <CardDescription>
                Broadcast messages to users across the platform
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={() => setShowCreateForm(!showCreateForm)}
                variant={showCreateForm ? "outline" : "default"}
              >
                {showCreateForm ? 'Cancel' : 'Create Announcement'}
              </Button>
              <Button onClick={fetchAnnouncements} variant="outline">
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Announcement</CardTitle>
            <CardDescription>
              This announcement will be visible to all selected user roles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Announcement title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="severity">Severity</Label>
                <Select
                  value={form.severity}
                  onValueChange={(value: 'info' | 'warning' | 'urgent') =>
                    setForm({ ...form, severity: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Announcement message content..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={4}
              />
            </div>

            <div>
              <Label>Target Roles</Label>
              <div className="flex space-x-4 mt-2">
                {['bidder', 'auctioneer', 'admin'].map((role) => (
                  <label key={role} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={form.target_roles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                      className="rounded"
                    />
                    <span className="capitalize">{role}s</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="expires">Expires At (Optional)</Label>
              <Input
                id="expires"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={createAnnouncement}
                disabled={submitting || !form.title || !form.message || form.target_roles.length === 0}
                className="flex-1"
              >
                {submitting ? 'Creating...' : 'Create Announcement'}
              </Button>
              <Button
                onClick={() => setShowCreateForm(false)}
                variant="outline"
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Announcements List */}
      <Card>
        <CardContent>
          {announcements.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-600">No announcements created yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge variant={getSeverityBadgeVariant(announcement.severity)}>
                          {announcement.severity.toUpperCase()}
                        </Badge>
                        <Badge variant={announcement.is_active ? 'default' : 'outline'}>
                          {announcement.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <div className="flex space-x-1">
                          {announcement.target_roles.map((role) => (
                            <Badge key={role} variant="outline" className="text-xs">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <h3 className="font-medium text-lg mb-2">{announcement.title}</h3>
                      <p className="text-gray-600 mb-3">{announcement.message}</p>

                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>
                          Created: {new Date(announcement.created_at).toLocaleDateString()}
                        </span>
                        <span>
                          By: {formatUserName(announcement.admin)} ({announcement.admin.email})
                        </span>
                        {announcement.expires_at && (
                          <span>
                            Expires: {new Date(announcement.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2 ml-4">
                      <Button
                        size="sm"
                        variant={announcement.is_active ? "destructive" : "default"}
                        onClick={() => toggleAnnouncementStatus(announcement.id, announcement.is_active)}
                      >
                        {announcement.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteAnnouncement(announcement.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {announcements.filter(a => a.is_active).length}
            </CardTitle>
            <CardDescription>Active Announcements</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Currently visible to users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {announcements.filter(a => a.severity === 'urgent').length}
            </CardTitle>
            <CardDescription>Urgent Messages</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              High priority announcements
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {announcements.filter(a => a.expires_at && new Date(a.expires_at) < new Date()).length}
            </CardTitle>
            <CardDescription>Expired</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Past expiration date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {announcements.length}
            </CardTitle>
            <CardDescription>Total Created</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              All time announcements
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}