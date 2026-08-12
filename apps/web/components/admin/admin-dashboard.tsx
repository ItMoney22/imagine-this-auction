'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import InvoiceManager from './invoice-manager'
import PayoutManager from './payout-manager'
import UserManager from './user-manager'
import AuctioneerManager from './auctioneer-manager'
import FinancialReports from './financial-reports'
import ComplianceManager from './compliance-manager'
import NotificationManager from './notification-manager'

type AdminTab = 'overview' | 'users' | 'auctioneers' | 'financials' | 'compliance' | 'notifications' | 'invoices' | 'payouts'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')

  const tabs = [
    { id: 'overview' as AdminTab, name: 'Overview', description: 'System overview and statistics' },
    { id: 'users' as AdminTab, name: 'Users', description: 'User management and role controls' },
    { id: 'auctioneers' as AdminTab, name: 'Auctioneers', description: 'Auctioneer approvals and management' },
    { id: 'financials' as AdminTab, name: 'Financials', description: 'Revenue and financial reporting' },
    { id: 'compliance' as AdminTab, name: 'Compliance', description: 'KYC and fraud prevention' },
    { id: 'notifications' as AdminTab, name: 'Notifications', description: 'System announcements and alerts' },
    { id: 'invoices' as AdminTab, name: 'Invoices', description: 'Invoice and escrow management' },
    { id: 'payouts' as AdminTab, name: 'Payouts', description: 'Auctioneer payout processing' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Manage the ImagineThisAuction platform
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-1 rounded-lg bg-gray-200 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors
                  ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }
                `}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'users' && <UserManager />}
        {activeTab === 'auctioneers' && <AuctioneerManager />}
        {activeTab === 'financials' && <FinancialReports />}
        {activeTab === 'compliance' && <ComplianceManager />}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              <span>Delivery batches, stats, and manual triggers live in the ops console.</span>
              <Link
                href="/admin/notifications"
                className="font-semibold text-indigo-700 hover:text-indigo-900"
              >
                Open Notification Ops Console →
              </Link>
            </div>
            <NotificationManager />
          </div>
        )}
        {activeTab === 'invoices' && <InvoiceManager />}
        {activeTab === 'payouts' && <PayoutManager />}
      </div>
    </div>
  )
}

function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState([
    { title: 'Total Auctions', value: '0', description: 'Active and completed auctions' },
    { title: 'Pending Invoices', value: '0', description: 'Invoices awaiting payment' },
    { title: 'Escrow Holdings', value: '$0.00', description: 'Funds held in escrow' },
    { title: 'Pending Payouts', value: '$0.00', description: 'Owed to auctioneers' },
  ])
  const [recentActivity, setRecentActivity] = useState<
    { label: string; detail: string; badge: string; badgeVariant: 'default' | 'secondary' | 'outline' }[]
  >([])

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true)
        const supabase = createClient()
        const [
          auctionsResult,
          pendingInvoicesResult,
          escrowResult,
          pendingPayoutsResult,
          recentAuctionsResult,
          recentInvoicesResult,
          recentPayoutsResult,
        ] = await Promise.all([
          supabase.from('auctions').select('id', { count: 'exact', head: true }),
          supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('is_paid', false),
          supabase
            .from('wallet_ledger')
            .select('amount, transaction_type')
            .in('transaction_type', ['escrow_hold', 'escrow_release']),
          supabase
            .from('payouts_due')
            .select('amount')
            .eq('is_paid', false),
          supabase.from('auctions').select('title, created_at').order('created_at', { ascending: false }).limit(2),
          supabase.from('invoices').select('id, total_amount, created_at, is_shipped').order('created_at', { ascending: false }).limit(2),
          supabase.from('payouts_due').select('id, amount, created_at, is_paid').order('created_at', { ascending: false }).limit(2),
        ])

        const escrowTotal = (escrowResult.data || []).reduce((sum, entry) => {
          return entry.transaction_type === 'escrow_release' ? sum - entry.amount : sum + entry.amount
        }, 0)
        const pendingPayoutTotal = (pendingPayoutsResult.data || []).reduce((sum, payout) => sum + payout.amount, 0)
        const formatCurrency = (amount: number) =>
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100)

        setStats([
          {
            title: 'Total Auctions',
            value: `${auctionsResult.count || 0}`,
            description: 'Active and completed auctions',
          },
          {
            title: 'Pending Invoices',
            value: `${pendingInvoicesResult.count || 0}`,
            description: 'Invoices awaiting payment',
          },
          {
            title: 'Escrow Holdings',
            value: formatCurrency(escrowTotal),
            description: 'Funds held in escrow',
          },
          {
            title: 'Pending Payouts',
            value: formatCurrency(pendingPayoutTotal),
            description: 'Owed to auctioneers',
          },
        ])

        const activity = [
          ...(recentAuctionsResult.data || []).map((auction) => ({
            sortKey: auction.created_at,
            label: `Auction created: ${auction.title}`,
            detail: 'New auction added to the marketplace',
            badge: new Date(auction.created_at).toLocaleDateString(),
            badgeVariant: 'secondary' as const,
          })),
          ...(recentInvoicesResult.data || []).map((invoice) => ({
            sortKey: invoice.created_at,
            label: `Invoice ${invoice.id.slice(0, 8)}${invoice.is_shipped ? ' shipped' : ' created'}`,
            detail: `Total ${formatCurrency(invoice.total_amount)}`,
            badge: invoice.is_shipped ? 'Shipped' : 'Invoice',
            badgeVariant: invoice.is_shipped ? 'default' as const : 'outline' as const,
          })),
          ...(recentPayoutsResult.data || []).map((payout) => ({
            sortKey: payout.created_at,
            label: `Payout ${payout.id.slice(0, 8)}`,
            detail: `${formatCurrency(payout.amount)} ${payout.is_paid ? 'paid' : 'pending'}`,
            badge: payout.is_paid ? 'Paid' : 'Pending',
            badgeVariant: payout.is_paid ? 'default' as const : 'secondary' as const,
          })),
        ]
          .sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime())
          .slice(0, 5)
          .map(({ sortKey: _sortKey, ...item }) => item)

        setRecentActivity(activity)
      } catch (error) {
        console.error('Failed to load admin overview statistics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadOverview()
  }, [])

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl font-bold">
                {loading ? <div className="h-8 w-24 animate-pulse rounded bg-gray-200" /> : stat.value}
              </CardTitle>
              <CardDescription>{stat.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Latest system events and transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-sm text-gray-600">No recent activity available.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((item) => (
                <div key={`${item.label}-${item.badge}`} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-gray-600">{item.detail}</p>
                  </div>
                  <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

