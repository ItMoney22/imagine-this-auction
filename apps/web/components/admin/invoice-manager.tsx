'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  buyer: {
    first_name: string
    last_name: string
    email: string
  }
}

export default function InvoiceManager() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    fetchInvoices()
  }, [filter])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('status', filter)
      }

      const response = await fetch(`/api/invoices?${params}`)
      if (!response.ok) throw new Error('Failed to fetch invoices')

      const data = await response.json()
      setInvoices(data.invoices || [])
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (invoice: Invoice) => {
    if (!invoice.is_paid) {
      return <Badge variant="destructive">Unpaid</Badge>
    } else if (invoice.is_paid && !invoice.is_shipped) {
      return <Badge variant="secondary">In Escrow</Badge>
    } else if (invoice.is_shipped) {
      return <Badge variant="default">Shipped</Badge>
    }
    return <Badge variant="outline">Unknown</Badge>
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100)
  }

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) || null

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading invoices...</p>
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
              <CardTitle>Invoice Management</CardTitle>
              <CardDescription>
                Manage all invoices and escrow holdings
              </CardDescription>
            </div>
            <div className="flex items-center space-x-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter invoices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="pending">Pending Payment</SelectItem>
                  <SelectItem value="escrow">In Escrow</SelectItem>
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
      <Card>
        <CardContent>
          {selectedInvoice && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>
                <Button variant="outline" size="sm" onClick={() => setSelectedInvoiceId(null)}>
                  Close
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm text-gray-700 md:grid-cols-2">
                <p><strong>Invoice ID:</strong> {selectedInvoice.id}</p>
                <p><strong>Created:</strong> {new Date(selectedInvoice.created_at).toLocaleString()}</p>
                <p><strong>Buyer:</strong> {selectedInvoice.buyer.first_name} {selectedInvoice.buyer.last_name} ({selectedInvoice.buyer.email})</p>
                <p><strong>Status:</strong> {selectedInvoice.is_shipped ? 'Shipped' : selectedInvoice.is_paid ? 'In Escrow' : 'Unpaid'}</p>
                <p><strong>Lot:</strong> #{selectedInvoice.lot.lot_number} {selectedInvoice.lot.title}</p>
                <p><strong>Auction:</strong> {selectedInvoice.lot.auction.title}</p>
                <p><strong>Auctioneer:</strong> {selectedInvoice.lot.auction.auctioneer.company_name}</p>
                <p><strong>Total:</strong> {formatCurrency(selectedInvoice.total_amount)}</p>
                <p><strong>Hammer Price:</strong> {formatCurrency(selectedInvoice.hammer_price)}</p>
                <p><strong>Buyer Premium:</strong> {formatCurrency(selectedInvoice.buyer_premium_amount)}</p>
                <p><strong>Tracking Number:</strong> {selectedInvoice.tracking_number || 'Not provided'}</p>
                <p><strong>Shipped At:</strong> {selectedInvoice.shipped_at ? new Date(selectedInvoice.shipped_at).toLocaleString() : 'Not shipped'}</p>
              </div>
            </div>
          )}

          {invoices.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-600">No invoices found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-medium">
                          Lot #{invoice.lot.lot_number}: {invoice.lot.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {invoice.lot.auction.title} • {invoice.lot.auction.auctioneer.company_name}
                        </p>
                        <p className="text-sm text-gray-600">
                          Buyer: {invoice.buyer.first_name} {invoice.buyer.last_name} ({invoice.buyer.email})
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(invoice.total_amount)}</p>
                      <p className="text-sm text-gray-600">
                        Hammer: {formatCurrency(invoice.hammer_price)} +
                        Premium: {formatCurrency(invoice.buyer_premium_amount)}
                      </p>
                      {invoice.tracking_number && (
                        <p className="text-xs text-gray-500">
                          Tracking: {invoice.tracking_number}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      {getStatusBadge(invoice)}
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </p>
                      {invoice.shipped_at && (
                        <p className="text-xs text-gray-500">
                          Shipped: {new Date(invoice.shipped_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {invoices.filter(i => !i.is_paid).length}
            </CardTitle>
            <CardDescription>Pending Payment</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Total: {formatCurrency(
                invoices
                  .filter(i => !i.is_paid)
                  .reduce((sum, i) => sum + i.total_amount, 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {invoices.filter(i => i.is_paid && !i.is_shipped).length}
            </CardTitle>
            <CardDescription>In Escrow</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Total: {formatCurrency(
                invoices
                  .filter(i => i.is_paid && !i.is_shipped)
                  .reduce((sum, i) => sum + i.total_amount, 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {invoices.filter(i => i.is_shipped).length}
            </CardTitle>
            <CardDescription>Completed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Total: {formatCurrency(
                invoices
                  .filter(i => i.is_shipped)
                  .reduce((sum, i) => sum + i.total_amount, 0)
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
