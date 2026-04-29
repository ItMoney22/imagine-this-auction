'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'

interface Invoice {
  id: string
  hammer_price: number
  buyer_premium_amount: number
  total_amount: number
  is_paid: boolean
  is_shipped: boolean
  shipped_at: string | null
  tracking_number: string | null
  created_at: string
  lot: {
    lot_number: number
    title: string
    auction: {
      title: string
      auctioneer: {
        company_name: string
      }
    }
  }
}

export default function InvoicesDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchInvoices()
  }, [filter])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('status', filter)
      }

      const response = await fetch(`/api/invoices?${params}`)
      if (!response.ok) throw new Error('Failed to fetch invoices')

      const data = await response.json()
      setInvoices(data.invoices || [])
    } catch (error) {
      setError('We could not load your invoices. Please try again.')
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusInfo = (invoice: Invoice) => {
    if (!invoice.is_paid) {
      return {
        badge: <Badge variant="destructive">Payment Required</Badge>,
        description: 'Payment is required to complete this purchase',
        action: (
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            Pay Now
          </Button>
        ),
      }
    } else if (invoice.is_paid && !invoice.is_shipped) {
      return {
        badge: <Badge variant="secondary">Paid - Awaiting Shipment</Badge>,
        description: 'Payment received. Your item will be shipped soon.',
        action: null,
      }
    } else if (invoice.is_shipped) {
      return {
        badge: <Badge variant="default">Shipped</Badge>,
        description: invoice.tracking_number
          ? `Shipped with tracking: ${invoice.tracking_number}`
          : 'Your item has been shipped',
        action: invoice.tracking_number ? (
          <Button variant="outline" size="sm">
            Track Package
          </Button>
        ) : null,
      }
    }
    return {
      badge: <Badge variant="outline">Unknown</Badge>,
      description: 'Status unknown',
      action: null,
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading your invoices...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-red-600">{error}</p>
              <Button onClick={fetchInvoices} variant="outline" className="mt-4">
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Invoices</h1>
          <p className="mt-2 text-gray-600">
            View and manage your auction wins and payments
          </p>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Invoice History</CardTitle>
                <CardDescription>
                  Track the status of your auction wins
                </CardDescription>
              </div>
              <div className="flex items-center space-x-4">
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter invoices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Invoices</SelectItem>
                    <SelectItem value="pending">Payment Required</SelectItem>
                    <SelectItem value="escrow">Paid - Processing</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={fetchInvoices} variant="outline">
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Invoices List */}
        {invoices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mx-auto w-24 h-24 mb-4 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No invoices yet
              </h3>
              <p className="text-gray-600 mb-4">
                You haven't won any auctions yet. Start bidding to see your invoices here.
              </p>
              <Link href="/auctions">
                <Button>Browse Auctions</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => {
              const statusInfo = getStatusInfo(invoice)

              return (
                <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">
                            Lot #{invoice.lot.lot_number}: {invoice.lot.title}
                          </h3>
                          {statusInfo.badge}
                        </div>

                        <p className="text-gray-600 mb-1">
                          {invoice.lot.auction.title}
                        </p>
                        <p className="text-sm text-gray-500 mb-3">
                          {invoice.lot.auction.auctioneer.company_name}
                        </p>

                        <p className="text-sm text-gray-600 mb-4">
                          {statusInfo.description}
                        </p>

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>
                            Won: {new Date(invoice.created_at).toLocaleDateString()}
                          </span>
                          {invoice.shipped_at && (
                            <span>
                              Shipped: {new Date(invoice.shipped_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right ml-6">
                        <div className="mb-4">
                          <p className="text-2xl font-bold text-gray-900">
                            {formatCurrency(invoice.total_amount)}
                          </p>
                          <div className="text-sm text-gray-600">
                            <p>Hammer: {formatCurrency(invoice.hammer_price)}</p>
                            <p>Premium: {formatCurrency(invoice.buyer_premium_amount)}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {statusInfo.action}
                          <div>
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Summary */}
        {invoices.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {invoices.length}
                  </p>
                  <p className="text-sm text-gray-600">Total Wins</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(
                      invoices
                        .filter(i => i.is_paid)
                        .reduce((sum, i) => sum + i.total_amount, 0)
                    )}
                  </p>
                  <p className="text-sm text-gray-600">Total Paid</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(
                      invoices
                        .filter(i => !i.is_paid)
                        .reduce((sum, i) => sum + i.total_amount, 0)
                    )}
                  </p>
                  <p className="text-sm text-gray-600">Outstanding</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
