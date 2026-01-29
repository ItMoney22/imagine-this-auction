import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Gavel,
  Package,
  DollarSign,
  Clock,
  Truck,
  CalendarDays,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { getAuctioneerDashboard } from '@/lib/auctioneer/dashboard'
import { formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const formatUsd = (amountInCents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format((amountInCents ?? 0) / 100)

export default async function OrgOverviewPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'auctioneer') {
    redirect('/dashboard')
  }

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('id, company_name, is_approved, approval_date, business_license')
    .eq('user_id', user.id)
    .single()

  if (!auctioneer) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            <div>
              <CardTitle className="text-xl">Complete Your Auctioneer Profile</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              We couldn&apos;t find an auctioneer profile associated with your account. Finish
              onboarding to access the vendor center.
            </p>
            <Button asChild>
              <Link href="/org/onboarding">Start Onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const dashboard = await getAuctioneerDashboard(supabase, auctioneer.id)

  const stats = [
    {
      title: 'Total Auctions',
      value: dashboard.metrics.totalAuctions.toLocaleString(),
      description: 'Auctions you’ve created',
      icon: Gavel,
      accent: 'text-blue-600',
    },
    {
      title: 'Live / Scheduled',
      value: `${dashboard.metrics.liveAuctions}/${dashboard.metrics.scheduledAuctions}`,
      description: 'Currently visible to bidders',
      icon: Clock,
      accent: 'text-emerald-600',
    },
    {
      title: 'Lots Published',
      value: dashboard.metrics.totalLots.toLocaleString(),
      description: 'Across all auctions',
      icon: Package,
      accent: 'text-purple-600',
    },
    {
      title: 'Pending Payouts',
      value: formatUsd(dashboard.metrics.pendingPayoutCents),
      description: 'Awaiting release',
      icon: DollarSign,
      accent: 'text-amber-600',
    },
  ]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">
          Welcome back, {profile.first_name || profile.last_name ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : auctioneer.company_name}
        </h1>
        <p className="text-gray-600">
          Track performance, fulfill orders, and keep upcoming auctions on schedule.
        </p>
        {!auctioneer.is_approved && (
          <div className="mt-4 flex items-center space-x-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            <Clock className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Approval in Progress</p>
              <p className="text-yellow-700">
                Your vendor account is pending review. You can configure auctions, but they
                won&apos;t appear to bidders until you&apos;re approved.
              </p>
            </div>
          </div>
        )}
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.accent}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              <p className="mt-1 text-xs text-gray-500">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Upcoming &amp; Live Auctions</CardTitle>
              <p className="text-sm text-gray-500">
                Keep your catalog prepped and confirm assets before go-live.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/org/auctions">Manage Auctions</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.upcomingAuctions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No upcoming auctions yet. Start by creating your next sale.
              </div>
            ) : (
              <ul className="space-y-4">
                {dashboard.upcomingAuctions.map((auction) => {
                  const statusVariant =
                    auction.status === 'live'
                      ? 'default'
                      : auction.status === 'scheduled'
                      ? 'secondary'
                      : 'outline'

                  return (
                    <li key={auction.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-medium text-gray-900">{auction.title}</h3>
                          <Badge variant={statusVariant}>{auction.status}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-4 w-4" />
                            {formatDate(auction.startsAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Gavel className="h-4 w-4" />
                            {auction.lotCount} lots
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>Ends {formatDate(auction.endsAt)}</span>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/org/auctions/${auction.id}`}>Open</Link>
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Fulfillment Queue</CardTitle>
              <p className="text-sm text-gray-500">
                Paid invoices waiting on shipment confirmation.
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>{dashboard.metrics.fulfillmentQueueCount} orders</p>
              <p className="font-medium text-gray-900">
                {formatUsd(dashboard.metrics.fulfillmentQueueValueCents)}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.fulfillmentQueue.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No shipments pending. Great job staying current!
              </div>
            ) : (
              <ul className="space-y-4">
                {dashboard.fulfillmentQueue.map((invoice) => (
                  <li key={invoice.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Truck className="h-4 w-4" />
                        <span>
                          Lot {invoice.lotNumber ?? '—'} · {invoice.lotTitle ?? 'Untitled lot'}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatUsd(invoice.totalAmount)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span>
                        Buyer: {invoice.buyerName || invoice.buyerEmail || 'Pending assignment'}
                        {invoice.buyerEmail ? ` · ${invoice.buyerEmail}` : ''}
                      </span>
                      <span>Created {formatDate(invoice.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span>Auction: {invoice.auctionTitle ?? 'Unknown auction'}</span>
                      {invoice.trackingNumber ? (
                        <Badge variant="outline">Tracking: {invoice.trackingNumber}</Badge>
                      ) : (
                        <Badge variant="secondary">Awaiting tracking</Badge>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button asChild variant="outline" size="sm">
                        <Link href="/org/invoices">Update shipment</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Payout Activity</CardTitle>
              <p className="text-sm text-gray-500">
                Track escrow releases and completed payouts.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/org/payouts">View payout history</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard.recentPayouts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No payout records yet. Once buyers confirm delivery, escrow will release here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {dashboard.recentPayouts.map((payout) => (
                      <tr key={payout.id}>
                        <td className="px-4 py-3 text-gray-600">{formatDate(payout.createdAt)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {formatUsd(payout.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {payout.isPaid ? (
                            <Badge variant="default" className="bg-emerald-600">
                              <ShieldCheck className="mr-1 h-3 w-3" /> Paid
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {payout.paymentReference || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <p className="text-sm text-gray-500">
              Shortcuts to your most common workflows.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link
                href="/org/auctions/new"
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div>
                  <p className="font-medium text-gray-900">Create Auction</p>
                  <p className="text-xs text-gray-500">Launch a new timed or catalog sale.</p>
                </div>
                <Gavel className="h-5 w-5 text-blue-600" />
              </Link>

              <Link
                href="/org/lots"
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div>
                  <p className="font-medium text-gray-900">Manage Lots</p>
                  <p className="text-xs text-gray-500">Bulk import or edit existing catalog items.</p>
                </div>
                <Package className="h-5 w-5 text-blue-600" />
              </Link>

              <Link
                href="/org/invoices"
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div>
                  <p className="font-medium text-gray-900">Invoice &amp; Escrow</p>
                  <p className="text-xs text-gray-500">Confirm shipments and release escrow funds.</p>
                </div>
                <DollarSign className="h-5 w-5 text-blue-600" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
