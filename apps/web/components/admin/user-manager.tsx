'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface User {
  id: string
  email: string
  role: 'bidder' | 'auctioneer' | 'admin'
  first_name: string | null
  last_name: string | null
  phone: string | null
  is_approved: boolean
  created_at: string
  updated_at: string
  auctioneer?: {
    id: string
    company_name: string
    is_approved: boolean
    created_at: string
  }[]
}

interface ActionForm {
  type: 'role' | 'status' | null
  userId: string | null
  currentValue: string | boolean | null
  newValue: string | boolean | null
  notes: string
}

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    role: 'all',
    status: 'all',
    search: '',
  })
  const [actionForm, setActionForm] = useState<ActionForm>({
    type: null,
    userId: null,
    currentValue: null,
    newValue: null,
    notes: '',
  })
  const [processingAction, setProcessingAction] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [filters])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (filters.role !== 'all') params.append('role', filters.role)
      if (filters.status !== 'all') params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)

      const response = await fetch(`/api/admin/users?${params}`)
      if (!response.ok) throw new Error('Failed to fetch users')

      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const openActionForm = (
    type: 'role' | 'status',
    userId: string,
    currentValue: string | boolean,
    newValue?: string | boolean
  ) => {
    setActionForm({
      type,
      userId,
      currentValue,
      newValue: newValue ?? null,
      notes: '',
    })
  }

  const closeActionForm = () => {
    setActionForm({
      type: null,
      userId: null,
      currentValue: null,
      newValue: null,
      notes: '',
    })
  }

  const executeAction = async () => {
    if (!actionForm.type || !actionForm.userId || actionForm.newValue === null) return

    try {
      setProcessingAction(true)

      const endpoint = actionForm.type === 'role'
        ? `/api/admin/users/${actionForm.userId}/role`
        : `/api/admin/users/${actionForm.userId}/status`

      const body = actionForm.type === 'role'
        ? { new_role: actionForm.newValue, notes: actionForm.notes }
        : { is_approved: actionForm.newValue, notes: actionForm.notes }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update user')
      }

      // Refresh users list
      await fetchUsers()
      closeActionForm()

    } catch (error) {
      console.error('Error executing action:', error)
      alert(error instanceof Error ? error.message : 'Failed to update user')
    } finally {
      setProcessingAction(false)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive'
      case 'auctioneer': return 'default'
      default: return 'secondary'
    }
  }

  const getStatusBadgeVariant = (isApproved: boolean) => {
    return isApproved ? 'default' : 'destructive'
  }

  const formatUserName = (user: User) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return 'No name provided'
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading users...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts, roles, and permissions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <Label>Role Filter</Label>
              <Select
                value={filters.role}
                onValueChange={(value) => setFilters({ ...filters, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="bidder">Bidders</SelectItem>
                  <SelectItem value="auctioneer">Auctioneers</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status Filter</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Search Users</Label>
              <Input
                placeholder="Email, name..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            <div className="flex items-end">
              <Button onClick={fetchUsers} variant="outline" className="w-full">
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardContent>
          {users.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-600">No users found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-medium">{formatUserName(user)}</h3>
                        <p className="text-sm text-gray-600">{user.email}</p>
                        {user.phone && (
                          <p className="text-sm text-gray-500">{user.phone}</p>
                        )}
                        {user.auctioneer && user.auctioneer.length > 0 && (
                          <p className="text-sm text-blue-600">
                            Company: {user.auctioneer[0].company_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="flex space-x-2">
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role}
                        </Badge>
                        <Badge variant={getStatusBadgeVariant(user.is_approved)}>
                          {user.is_approved ? 'Active' : 'Suspended'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Joined: {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <Select
                        value=""
                        onValueChange={(value) => {
                          if (value !== user.role) {
                            openActionForm('role', user.id, user.role, value)
                          }
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Change Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bidder">Bidder</SelectItem>
                          <SelectItem value="auctioneer">Auctioneer</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        variant={user.is_approved ? "destructive" : "default"}
                        onClick={() =>
                          openActionForm('status', user.id, user.is_approved, !user.is_approved)
                        }
                      >
                        {user.is_approved ? 'Suspend' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Confirmation Modal */}
      {actionForm.type && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>
                Confirm {actionForm.type === 'role' ? 'Role Change' : 'Status Change'}
              </CardTitle>
              <CardDescription>
                This action will be logged in the audit trail
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm">
                  <strong>Current:</strong> {String(actionForm.currentValue)}
                </p>
                <p className="text-sm">
                  <strong>New:</strong> {String(actionForm.newValue)}
                </p>
              </div>

              <div>
                <Label htmlFor="action-notes">Notes (Optional)</Label>
                <Textarea
                  id="action-notes"
                  placeholder="Reason for this change..."
                  value={actionForm.notes}
                  onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })}
                />
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={executeAction}
                  disabled={processingAction}
                  className="flex-1"
                >
                  {processingAction ? 'Processing...' : 'Confirm'}
                </Button>
                <Button
                  onClick={closeActionForm}
                  variant="outline"
                  disabled={processingAction}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {users.filter(u => u.role === 'bidder').length}
            </CardTitle>
            <CardDescription>Bidders</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Active: {users.filter(u => u.role === 'bidder' && u.is_approved).length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {users.filter(u => u.role === 'auctioneer').length}
            </CardTitle>
            <CardDescription>Auctioneers</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Active: {users.filter(u => u.role === 'auctioneer' && u.is_approved).length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {users.filter(u => u.role === 'admin').length}
            </CardTitle>
            <CardDescription>Admins</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              System administrators
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {users.filter(u => !u.is_approved).length}
            </CardTitle>
            <CardDescription>Suspended</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Require attention
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}