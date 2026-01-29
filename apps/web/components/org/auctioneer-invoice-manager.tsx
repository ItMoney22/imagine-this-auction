'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  notes: string | null
  created_at: string
  lot: {
    lot_number: number
    title: string
    auction: {
      title: string
    }
  }
  buyer: {
    first_name: string
    last_name: string
    email: string
  }
}

interface ShippingForm {
  tracking_number: string
  shipping_notes: string
}

export default function AuctioneerInvoiceManager() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('escrow')
  const [shippingForm, setShippingForm] = useState<ShippingForm>({
    tracking_number: '',
    shipping_notes: '',
  })
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [processingShipment, setProcessingShipment] = useState<string | null>(null)

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

  const markAsShipped = async (invoiceId: string) => {
    try {
      setProcessingShipment(invoiceId)

      const response = await fetch(`/api/invoices/${invoiceId}/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_number: shippingForm.tracking_number || null,
          shipping_notes: shippingForm.shipping_notes || null,
        }),
      })

      if (!response.ok) throw new Error('Failed to mark invoice as shipped')

      // Refresh invoices list
      await fetchInvoices()

      // Reset form
      setShippingForm({ tracking_number: '', shipping_notes: '' })
      setSelectedInvoice(null)

    } catch (error) {
      console.error('Error marking as shipped:', error)
      alert('Failed to mark item as shipped')
    } finally {
      setProcessingShipment(null)
    }
  }

  const getStatusBadge = (invoice: Invoice) => {
    if (!invoice.is_paid) {
      return <Badge variant="destructive">Unpaid</Badge>
    } else if (invoice.is_paid && !invoice.is_shipped) {
      return <Badge variant="secondary">Ready to Ship</Badge>
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

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading invoices...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Invoice Management</h1>
        <p className="mt-2 text-gray-600">
          Manage customer invoices and shipping
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Invoices</CardTitle>
              <CardDescription>
                Manage invoices for your auction items
              </CardDescription>
            </div>
            <div className="flex items-center space-x-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter invoices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="pending">Unpaid</SelectItem>
                  <SelectItem value="escrow">Ready to Ship</SelectItem>
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

      {/* Shipping Form for Ready to Ship Items */}
      {filter === 'escrow' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ship Items</CardTitle>
            <CardDescription>
              Mark items as shipped and provide tracking information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="tracking">Tracking Number (Optional)</Label>
                <Input
                  id="tracking"
                  placeholder="e.g., 1Z999AA1234567890"
                  value={shippingForm.tracking_number}
                  onChange={(e) =>
                    setShippingForm({ ...shippingForm, tracking_number: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Shipping Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Special shipping instructions or notes..."
                value={shippingForm.shipping_notes}
                onChange={(e) =>
                  setShippingForm({ ...shippingForm, shipping_notes: e.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices List */}
      <Card>
        <CardContent>
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
                          {invoice.lot.auction.title}
                        </p>
                        <p className="text-sm text-gray-600">
                          Buyer: {invoice.buyer.first_name} {invoice.buyer.last_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {invoice.buyer.email}
                        </p>
                        {invoice.notes && (
                          <p className="text-sm text-gray-500 mt-1">
                            Notes: {invoice.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(invoice.total_amount)}</p>
                      <p className="text-sm text-gray-600">
                        Hammer: {formatCurrency(invoice.hammer_price)}
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
                        Won: {new Date(invoice.created_at).toLocaleDateString()}
                      </p>
                      {invoice.shipped_at && (
                        <p className="text-xs text-gray-500">
                          Shipped: {new Date(invoice.shipped_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {invoice.is_paid && !invoice.is_shipped && (
                      <Button
                        onClick={() => markAsShipped(invoice.id)}
                        disabled={processingShipment === invoice.id}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {processingShipment === invoice.id ? 'Shipping...' : 'Mark Shipped'}
                      </Button>
                    )}
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
              {invoices.filter(i => !i.is_paid).length}
            </CardTitle>
            <CardDescription>Unpaid</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {formatCurrency(
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
            <CardDescription>Ready to Ship</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {formatCurrency(
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
            <CardDescription>Shipped</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {formatCurrency(
                invoices
                  .filter(i => i.is_shipped)
                  .reduce((sum, i) => sum + i.total_amount, 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {formatCurrency(
                invoices.reduce((sum, i) => sum + i.hammer_price, 0)
              )}
            </CardTitle>
            <CardDescription>Total Revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              From {invoices.length} sales
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}