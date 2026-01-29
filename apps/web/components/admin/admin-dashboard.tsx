'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
        {activeTab === 'notifications' && <NotificationManager />}
        {activeTab === 'invoices' && <InvoiceManager />}
        {activeTab === 'payouts' && <PayoutManager />}
      </div>
    </div>
  )
}

function OverviewTab() {
  // TODO: Add real statistics
  const stats = [
    {
      title: 'Total Auctions',
      value: '45',
      description: 'Active and completed auctions',
      trend: '+12% from last month',
    },
    {
      title: 'Pending Invoices',
      value: '12',
      description: 'Invoices awaiting payment',
      trend: '3 new today',
    },
    {
      title: 'Escrow Holdings',
      value: '$24,570',
      description: 'Funds held in escrow',
      trend: '+$2,340 this week',
    },
    {
      title: 'Pending Payouts',
      value: '$8,420',
      description: 'Owed to auctioneers',
      trend: '5 payouts due',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl font-bold">{stat.value}</CardTitle>
              <CardDescription>{stat.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{stat.description}</p>
              <p className="mt-1 text-xs text-green-600">{stat.trend}</p>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">Auction #AUC-001 ended</p>
                <p className="text-sm text-gray-600">12 lots processed, 8 winners</p>
              </div>
              <Badge variant="secondary">2 hours ago</Badge>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">Invoice #INV-1234 shipped</p>
                <p className="text-sm text-gray-600">Escrow released to auctioneer</p>
              </div>
              <Badge variant="secondary">4 hours ago</Badge>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">New auctioneer registration</p>
                <p className="text-sm text-gray-600">Heritage Auctions LLC</p>
              </div>
              <Badge variant="outline">Pending approval</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

