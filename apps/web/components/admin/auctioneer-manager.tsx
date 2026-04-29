'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink, FileText } from 'lucide-react'

interface Auctioneer {
  id: string
  user_id: string
  company_name: string
  business_license: string | null
  tax_id: string | null
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  zip_code: string
  website: string | null
  is_approved: boolean
  approval_date: string | null
  created_at: string
  updated_at: string
  license_document: {
    id: string
    filename: string
    file_url: string
    file_size: number | null
    mime_type: string | null
    verification_status: 'pending' | 'approved' | 'rejected'
    uploaded_at: string
    verification_notes: string | null
  } | null
  user: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    is_approved: boolean
    created_at: string
  }
  stats: {
    total_auctions: number
    completed_auctions: number
    commission_owed: number
    commission_paid: number
  }
}

export default function AuctioneerManager() {
  const [auctioneers, setAuctioneers] = useState<Auctioneer[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
  })
  const [selectedAuctioneer, setSelectedAuctioneer] = useState<Auctioneer | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  useEffect(() => {
    fetchAuctioneers()
  }, [filters])

  const fetchAuctioneers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (filters.status !== 'all') params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)

      const response = await fetch(`/api/admin/auctioneers?${params}`)
      if (!response.ok) throw new Error('Failed to fetch auctioneers')

      const data = await response.json()
      setAuctioneers(data.auctioneers || [])
    } catch (error) {
      console.error('Error fetching auctioneers:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateAuctioneerStatus = async (auctioneerId: string, isApproved: boolean) => {
    try {
      setProcessingAction(true)

      const response = await fetch(`/api/admin/auctioneers/${auctioneerId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_approved: isApproved,
          notes: actionNotes,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update auctioneer status')
      }

      // Refresh data
      await fetchAuctioneers()
      setSelectedAuctioneer(null)
      setActionNotes('')

    } catch (error) {
      console.error('Error updating auctioneer status:', error)
      alert(error instanceof Error ? error.message : 'Failed to update auctioneer')
    } finally {
      setProcessingAction(false)
    }
  }

  const openLicenseDocument = async (auctioneerId: string) => {
    try {
      const response = await fetch(`/api/admin/auctioneers/${auctioneerId}/license`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open license document')
      }

      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Error opening license document:', error)
      alert(error instanceof Error ? error.message : 'Failed to open license document')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100)
  }

  const formatUserName = (user: Auctioneer['user']) => {
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
            <p className="mt-2 text-gray-600">Loading auctioneers...</p>
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
              <CardTitle>Auctioneer Management</CardTitle>
              <CardDescription>
                Approve and manage auctioneer applications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  <SelectItem value="all">All Applications</SelectItem>
                  <SelectItem value="pending">Pending Approval</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Search</Label>
              <Input
                placeholder="Company name, license..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            <div className="flex items-end">
              <Button onClick={fetchAuctioneers} variant="outline" className="w-full">
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auctioneers List */}
      <Card>
        <CardContent>
          {auctioneers.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-600">No auctioneers found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {auctioneers.map((auctioneer) => (
                <div
                  key={auctioneer.id}
                  className="flex items-start justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-start space-x-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-lg">{auctioneer.company_name}</h3>
                        <p className="text-sm text-gray-600">
                          Contact: {formatUserName(auctioneer.user)} ({auctioneer.user.email})
                        </p>
                        {auctioneer.user.phone && (
                          <p className="text-sm text-gray-600">Phone: {auctioneer.user.phone}</p>
                        )}

                        <div className="mt-2 space-y-1">
                          <p className="text-sm text-gray-600">
                            <strong>Address:</strong> {auctioneer.address_line1}
                            {auctioneer.address_line2 && `, ${auctioneer.address_line2}`},
                            {auctioneer.city}, {auctioneer.state} {auctioneer.zip_code}
                          </p>

                          {auctioneer.business_license && (
                            <p className="text-sm text-gray-600">
                              <strong>License:</strong> {auctioneer.business_license}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                            <FileText className="h-4 w-4 text-indigo-600" />
                            <strong>License document:</strong>
                            {auctioneer.license_document ? (
                              <>
                                <Badge
                                  variant={
                                    auctioneer.license_document.verification_status === 'approved'
                                      ? 'default'
                                      : auctioneer.license_document.verification_status === 'rejected'
                                        ? 'destructive'
                                        : 'secondary'
                                  }
                                >
                                  {auctioneer.license_document.verification_status}
                                </Badge>
                                <button
                                  type="button"
                                  onClick={() => openLicenseDocument(auctioneer.id)}
                                  className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
                                >
                                  {auctioneer.license_document.filename}
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <Badge variant="destructive">Missing upload</Badge>
                            )}
                          </div>

                          {auctioneer.tax_id && (
                            <p className="text-sm text-gray-600">
                              <strong>Tax ID:</strong> {auctioneer.tax_id}
                            </p>
                          )}

                          {auctioneer.website && (
                            <p className="text-sm text-gray-600">
                              <strong>Website:</strong>
                              <a href={auctioneer.website} target="_blank" rel="noopener" className="text-blue-600 hover:underline ml-1">
                                {auctioneer.website}
                              </a>
                            </p>
                          )}
                        </div>

                        {/* Performance Stats */}
                        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                          <div className="text-center">
                            <p className="text-lg font-medium">{auctioneer.stats.total_auctions}</p>
                            <p className="text-xs text-gray-600">Total Auctions</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-medium">{auctioneer.stats.completed_auctions}</p>
                            <p className="text-xs text-gray-600">Completed</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-medium text-green-600">
                              {formatCurrency(auctioneer.stats.commission_paid)}
                            </p>
                            <p className="text-xs text-gray-600">Paid Out</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-medium text-orange-600">
                              {formatCurrency(auctioneer.stats.commission_owed)}
                            </p>
                            <p className="text-xs text-gray-600">Owed</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="ml-4 flex flex-col items-end space-y-2">
                    <div className="text-right">
                      <Badge variant={auctioneer.is_approved ? 'default' : 'destructive'}>
                        {auctioneer.is_approved ? 'Approved' : 'Pending'}
                      </Badge>
                      <p className="mt-1 text-xs text-gray-500">
                        Applied: {new Date(auctioneer.created_at).toLocaleDateString()}
                      </p>
                      {auctioneer.approval_date && (
                        <p className="text-xs text-gray-500">
                          Approved: {new Date(auctioneer.approval_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {!auctioneer.is_approved && (
                      <div className="flex flex-col space-y-2">
                        <Button
                          size="sm"
                          onClick={() => setSelectedAuctioneer(auctioneer)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Review Application
                        </Button>
                        {!auctioneer.license_document && (
                          <p className="max-w-36 text-right text-xs text-red-600">
                            License upload required
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Modal */}
      {selectedAuctioneer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Review Auctioneer Application</CardTitle>
              <CardDescription>
                {selectedAuctioneer.company_name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Company Name</Label>
                  <p className="text-sm">{selectedAuctioneer.company_name}</p>
                </div>
                <div>
                  <Label>Business License</Label>
                  <p className="text-sm">{selectedAuctioneer.business_license || 'Not provided'}</p>
                </div>
                <div>
                  <Label>Uploaded License</Label>
                  {selectedAuctioneer.license_document ? (
                    <button
                      type="button"
                      onClick={() => openLicenseDocument(selectedAuctioneer.id)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {selectedAuctioneer.license_document.filename}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <p className="text-sm text-red-600">Missing upload</p>
                  )}
                </div>
                <div>
                  <Label>Tax ID</Label>
                  <p className="text-sm">{selectedAuctioneer.tax_id || 'Not provided'}</p>
                </div>
                <div>
                  <Label>Website</Label>
                  <p className="text-sm">{selectedAuctioneer.website || 'Not provided'}</p>
                </div>
              </div>

              <div>
                <Label>Complete Address</Label>
                <p className="text-sm">
                  {selectedAuctioneer.address_line1}
                  {selectedAuctioneer.address_line2 && `, ${selectedAuctioneer.address_line2}`}
                  <br />
                  {selectedAuctioneer.city}, {selectedAuctioneer.state} {selectedAuctioneer.zip_code}
                </p>
              </div>

              <div>
                <Label htmlFor="action-notes">Review Notes</Label>
                <Textarea
                  id="action-notes"
                  placeholder="Notes about approval/rejection decision..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={() => updateAuctioneerStatus(selectedAuctioneer.id, true)}
                  disabled={processingAction || !selectedAuctioneer.license_document}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {processingAction ? 'Processing...' : 'Approve'}
                </Button>
                <Button
                  onClick={() => updateAuctioneerStatus(selectedAuctioneer.id, false)}
                  disabled={processingAction}
                  variant="destructive"
                  className="flex-1"
                >
                  {processingAction ? 'Processing...' : 'Reject'}
                </Button>
                <Button
                  onClick={() => {
                    setSelectedAuctioneer(null)
                    setActionNotes('')
                  }}
                  variant="outline"
                  disabled={processingAction}
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
              {auctioneers.filter(a => !a.is_approved).length}
            </CardTitle>
            <CardDescription>Pending Approval</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Need review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {auctioneers.filter(a => a.is_approved).length}
            </CardTitle>
            <CardDescription>Approved</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Active auctioneers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {auctioneers.reduce((sum, a) => sum + a.stats.total_auctions, 0)}
            </CardTitle>
            <CardDescription>Total Auctions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Platform-wide
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {formatCurrency(auctioneers.reduce((sum, a) => sum + a.stats.commission_owed, 0))}
            </CardTitle>
            <CardDescription>Pending Payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Awaiting payment
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
