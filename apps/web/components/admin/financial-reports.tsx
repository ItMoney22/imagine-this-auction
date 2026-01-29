'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface FinancialSummary {
  credits_minted: number
  credits_in_escrow: number
  credits_released: number
  platform_commission: number
  pending_payouts: number
  paid_payouts: number
  calculated_at: string
}

interface RecentTransaction {
  id: string
  transaction_type: string
  amount: number
  description: string
  created_at: string
  user: {
    email: string
    first_name: string | null
    last_name: string | null
  }
}

interface RecentInvoice {
  id: string
  total_amount: number
  is_paid: boolean
  is_shipped: boolean
  created_at: string
  buyer: {
    email: string
    first_name: string | null
    last_name: string | null
  }
  lot: {
    title: string
    lot_number: number
    auction: {
      title: string
    }
  }
}

interface RecentPayout {
  id: string
  amount: number
  platform_commission: number
  is_paid: boolean
  created_at: string
  auctioneer: {
    company_name: string
  }
  invoice: {
    lot: {
      title: string
      lot_number: number
    }
  }
}

interface FinancialData {
  summary: FinancialSummary
  metrics: {
    last_30_days: {
      credits_purchased: number
      transactions_completed: number
    }
  }
  recent_activity: {
    transactions: RecentTransaction[]
    invoices: RecentInvoice[]
    payouts: RecentPayout[]
  }
}

export default function FinancialReports() {
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'transactions' | 'invoices' | 'payouts'>('transactions')

  useEffect(() => {
    fetchFinancialData()
  }, [])

  const fetchFinancialData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/financials')
      if (!response.ok) throw new Error('Failed to fetch financial data')

      const financialData = await response.json()
      setData(financialData)
    } catch (error) {
      console.error('Error fetching financial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100)
  }

  const formatUserName = (user: { first_name: string | null; last_name: string | null }) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return 'No name'
  }

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'purchase': return 'bg-green-100 text-green-800'
      case 'bid_hold': return 'bg-yellow-100 text-yellow-800'
      case 'bid_refund': return 'bg-blue-100 text-blue-800'
      case 'escrow_hold': return 'bg-orange-100 text-orange-800'
      case 'escrow_release': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const exportCSV = () => {
    if (!data) return

    const csvData = [
      ['Metric', 'Value'],
      ['Credits Minted', formatCurrency(data.summary.credits_minted)],
      ['Credits in Escrow', formatCurrency(data.summary.credits_in_escrow)],
      ['Credits Released', formatCurrency(data.summary.credits_released)],
      ['Platform Commission', formatCurrency(data.summary.platform_commission)],
      ['Pending Payouts', formatCurrency(data.summary.pending_payouts)],
      ['Paid Payouts', formatCurrency(data.summary.paid_payouts)],
      ['Last 30 Days Credits', formatCurrency(data.metrics.last_30_days.credits_purchased)],
      ['Last 30 Days Transactions', data.metrics.last_30_days.transactions_completed.toString()],
    ]

    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading financial data...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-gray-600">Failed to load financial data</p>
          <Button onClick={fetchFinancialData} className="mt-4">
            Retry
          </Button>
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
              <CardTitle>Financial Reports</CardTitle>
              <CardDescription>
                Platform revenue, commission tracking, and financial oversight
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button onClick={exportCSV} variant="outline">
                Export CSV
              </Button>
              <Button onClick={fetchFinancialData} variant="outline">
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {formatCurrency(data.summary.credits_minted)}
            </CardTitle>
            <CardDescription>Credits Minted</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Total purchased</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-orange-600">
              {formatCurrency(data.summary.credits_in_escrow)}
            </CardTitle>
            <CardDescription>In Escrow</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Awaiting shipment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-green-600">
              {formatCurrency(data.summary.credits_released)}
            </CardTitle>
            <CardDescription>Released</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Completed sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-blue-600">
              {formatCurrency(data.summary.platform_commission)}
            </CardTitle>
            <CardDescription>Platform Revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">1.2% commission</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-red-600">
              {formatCurrency(data.summary.pending_payouts)}
            </CardTitle>
            <CardDescription>Pending Payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Owed to auctioneers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {formatCurrency(data.summary.paid_payouts)}
            </CardTitle>
            <CardDescription>Paid Payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Total distributed</p>
          </CardContent>
        </Card>
      </div>

      {/* 30-Day Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Last 30 Days</CardTitle>
          <CardDescription>Recent activity summary</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(data.metrics.last_30_days.credits_purchased)}
              </p>
              <p className="text-sm text-gray-600">Credits Purchased</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {data.metrics.last_30_days.transactions_completed}
              </p>
              <p className="text-sm text-gray-600">Transactions Completed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest platform transactions and activity</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Section Tabs */}
          <div className="mb-4">
            <nav className="flex space-x-1 rounded-lg bg-gray-200 p-1">
              {[
                { id: 'transactions' as const, name: 'Transactions', count: data.recent_activity.transactions.length },
                { id: 'invoices' as const, name: 'Invoices', count: data.recent_activity.invoices.length },
                { id: 'payouts' as const, name: 'Payouts', count: data.recent_activity.payouts.length },
              ].map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`
                    flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors
                    ${
                      activeSection === section.id
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }
                  `}
                >
                  {section.name} ({section.count})
                </button>
              ))}
            </nav>
          </div>

          {/* Transactions */}
          {activeSection === 'transactions' && (
            <div className="space-y-3">
              {data.recent_activity.transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getTransactionTypeColor(transaction.transaction_type)}>
                        {transaction.transaction_type.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm font-medium">{transaction.description}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {formatUserName(transaction.user)} ({transaction.user.email})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(Math.abs(transaction.amount))}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(transaction.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invoices */}
          {activeSection === 'invoices' && (
            <div className="space-y-3">
              {data.recent_activity.invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="text-sm font-medium">
                      Lot #{invoice.lot.lot_number}: {invoice.lot.title}
                    </p>
                    <p className="text-sm text-gray-600">{invoice.lot.auction.title}</p>
                    <p className="text-sm text-gray-600">
                      {formatUserName(invoice.buyer)} ({invoice.buyer.email})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(invoice.total_amount)}</p>
                    <div className="flex space-x-1">
                      <Badge variant={invoice.is_paid ? 'default' : 'destructive'}>
                        {invoice.is_paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                      {invoice.is_paid && (
                        <Badge variant={invoice.is_shipped ? 'default' : 'secondary'}>
                          {invoice.is_shipped ? 'Shipped' : 'Pending'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(invoice.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payouts */}
          {activeSection === 'payouts' && (
            <div className="space-y-3">
              {data.recent_activity.payouts.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="text-sm font-medium">{payout.auctioneer.company_name}</p>
                    <p className="text-sm text-gray-600">
                      Lot #{payout.invoice.lot.lot_number}: {payout.invoice.lot.title}
                    </p>
                    <p className="text-sm text-gray-600">
                      Commission: {formatCurrency(payout.platform_commission)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-600">{formatCurrency(payout.amount)}</p>
                    <Badge variant={payout.is_paid ? 'default' : 'destructive'}>
                      {payout.is_paid ? 'Paid' : 'Pending'}
                    </Badge>
                    <p className="text-xs text-gray-500">
                      {new Date(payout.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}