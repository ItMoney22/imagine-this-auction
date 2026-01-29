'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Payout {
  id: string
  amount: number
  platform_commission: number
  is_paid: boolean
  paid_at: string | null
  payment_reference: string | null
  created_at: string
  auctioneer: {
    company_name: string
  }
  invoice: {
    hammer_price: number
    total_amount: number
    lot: {
      lot_number: number
      title: string
      auction: {
        title: string
      }
    }
  }
}

export default function PayoutManager() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [paymentReference, setPaymentReference] = useState('')
  const [processingPayout, setProcessingPayout] = useState<string | null>(null)

  useEffect(() => {
    fetchPayouts()
  }, [filter])

  const fetchPayouts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('status', filter)
      }

      const response = await fetch(`/api/payouts?${params}`)
      if (!response.ok) throw new Error('Failed to fetch payouts')

      const data = await response.json()
      setPayouts(data.payouts || [])
    } catch (error) {
      console.error('Error fetching payouts:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsPaid = async (payoutId: string) => {
    if (!paymentReference.trim()) {
      alert('Please enter a payment reference')
      return
    }

    try {
      setProcessingPayout(payoutId)

      const response = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payout_id: payoutId,
          payment_reference: paymentReference.trim(),
        }),
      })

      if (!response.ok) throw new Error('Failed to mark payout as paid')

      // Refresh payouts list
      await fetchPayouts()
      setPaymentReference('')

    } catch (error) {
      console.error('Error marking payout as paid:', error)
      alert('Failed to mark payout as paid')
    } finally {
      setProcessingPayout(null)
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
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading payouts...</p>
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
              <CardTitle>Payout Management</CardTitle>
              <CardDescription>
                Manage auctioneer payouts and commissions
              </CardDescription>
            </div>
            <div className="flex items-center space-x-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter payouts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payouts</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={fetchPayouts} variant="outline">
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Payment Reference Input for Pending Payouts */}
      {filter === 'pending' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Process Payment</CardTitle>
            <CardDescription>
              Enter payment reference to mark payouts as paid
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end space-x-4">
              <div className="flex-1">
                <Label htmlFor="payment-reference">Payment Reference</Label>
                <Input
                  id="payment-reference"
                  placeholder="e.g., ACH-2024-001, CHECK-1234"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payouts List */}
      <Card>
        <CardContent>
          {payouts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-600">No payouts found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-medium">
                          {payout.auctioneer.company_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Lot #{payout.invoice.lot.lot_number}: {payout.invoice.lot.title}
                        </p>
                        <p className="text-sm text-gray-600">
                          {payout.invoice.lot.auction.title}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        {formatCurrency(payout.amount)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Hammer: {formatCurrency(payout.invoice.hammer_price)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Commission: {formatCurrency(payout.platform_commission)}
                      </p>
                      {payout.payment_reference && (
                        <p className="text-xs text-gray-500">
                          Ref: {payout.payment_reference}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      {payout.is_paid ? (
                        <Badge variant="default">Paid</Badge>
                      ) : (
                        <Badge variant="destructive">Pending</Badge>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Created: {new Date(payout.created_at).toLocaleDateString()}
                      </p>
                      {payout.paid_at && (
                        <p className="text-xs text-gray-500">
                          Paid: {new Date(payout.paid_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {!payout.is_paid && (
                      <Button
                        onClick={() => markAsPaid(payout.id)}
                        disabled={!paymentReference.trim() || processingPayout === payout.id}
                        size="sm"
                      >
                        {processingPayout === payout.id ? 'Processing...' : 'Mark Paid'}
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {payouts.filter(p => !p.is_paid).length}
            </CardTitle>
            <CardDescription>Pending Payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Amount: {formatCurrency(
                payouts
                  .filter(p => !p.is_paid)
                  .reduce((sum, p) => sum + p.amount, 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {payouts.filter(p => p.is_paid).length}
            </CardTitle>
            <CardDescription>Paid Payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Amount: {formatCurrency(
                payouts
                  .filter(p => p.is_paid)
                  .reduce((sum, p) => sum + p.amount, 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {formatCurrency(
                payouts.reduce((sum, p) => sum + p.platform_commission, 0)
              )}
            </CardTitle>
            <CardDescription>Platform Revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              From {payouts.length} transactions
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}