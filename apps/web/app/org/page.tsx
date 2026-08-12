import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity,
  ArrowUpRight,
  Banknote,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Gavel,
  Image as ImageIcon,
  PackageCheck,
  PackageOpen,
  Radar,
  Receipt,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { getAuctioneerDashboard } from '@/lib/auctioneer/dashboard'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const formatUsd = (amountInCents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((amountInCents ?? 0) / 100)

const formatUsdPrecise = (amountInCents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format((amountInCents ?? 0) / 100)

const formatPercent = (value: number) => `${Math.max(0, Math.min(100, value)).toLocaleString()}%`

const statusTone = {
  draft: 'border-slate-200 bg-slate-100 text-slate-700',
  scheduled: 'border-blue-200 bg-blue-50 text-blue-700',
  live: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ended: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-indigo-200 bg-indigo-50 text-indigo-700',
}

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
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl">Complete Your Auctioneer Profile</CardTitle>
              <p className="text-sm text-slate-500">Finish onboarding to access the vendor center.</p>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/become-auctioneer">Start Onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const dashboard = await getAuctioneerDashboard(supabase, auctioneer.id)
  const displayName =
    profile.first_name || profile.last_name
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
      : auctioneer.company_name
  const maxBidCount = Math.max(1, ...dashboard.bidActivity.map((point) => point.count))
  const catalogImageRate =
    dashboard.metrics.totalLots > 0
      ? Math.round((dashboard.metrics.lotsWithImages / dashboard.metrics.totalLots) * 100)
      : 0

  const headlineStats = [
    {
      label: 'Gross bid volume',
      value: formatUsd(dashboard.metrics.grossBidVolumeCents),
      detail: `${dashboard.metrics.activeBids.toLocaleString()} bids captured`,
      icon: Activity,
      tone: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Pending payouts',
      value: formatUsd(dashboard.metrics.pendingPayoutCents),
      detail: `${formatUsd(dashboard.metrics.paidOutCents)} already released`,
      icon: WalletCards,
      tone: 'from-amber-500 to-orange-600',
    },
    {
      label: 'Sell-through',
      value: formatPercent(dashboard.metrics.sellThroughRate),
      detail: `${dashboard.metrics.soldLots.toLocaleString()} of ${dashboard.metrics.totalLots.toLocaleString()} lots sold`,
      icon: PackageCheck,
      tone: 'from-indigo-500 to-violet-600',
    },
    {
      label: 'Unique bidders',
      value: dashboard.metrics.uniqueBidders.toLocaleString(),
      detail: `${dashboard.metrics.liveAuctions} live auctions right now`,
      icon: Users,
      tone: 'from-rose-500 to-pink-600',
    },
  ]

  const operatingStats = [
    {
      label: 'Total Auctions',
      value: dashboard.metrics.totalAuctions.toLocaleString(),
      detail: `${dashboard.metrics.draftAuctions} draft, ${dashboard.metrics.scheduledAuctions} scheduled`,
      icon: Gavel,
    },
    {
      label: 'Published Lots',
      value: dashboard.metrics.totalLots.toLocaleString(),
      detail: `${catalogImageRate}% have images`,
      icon: Boxes,
    },
    {
      label: 'Receivables',
      value: formatUsd(dashboard.metrics.invoiceReceivablesCents),
      detail: `${formatUsd(dashboard.metrics.pendingInvoiceCents)} unpaid`,
      icon: Receipt,
    },
    {
      label: 'Avg Hammer',
      value: formatUsd(dashboard.metrics.averageHammerCents),
      detail: `${dashboard.metrics.completedAuctions} ended or completed sales`,
      icon: CircleDollarSign,
    },
  ]

  return (
    <div className="space-y-7">
      <section className="gradient-border overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_30px_90px_rgba(79,70,229,0.16)] backdrop-blur-xl">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(238,242,255,0.78)_58%,rgba(253,242,248,0.72)_100%)] p-6 sm:p-8 xl:grid-cols-[1.25fr,0.75fr]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700 shadow-none">
                Auctioneer Command
              </Badge>
              <Badge
                className={
                  auctioneer.is_approved
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none'
                    : 'border-amber-200 bg-amber-50 text-amber-700 shadow-none'
                }
              >
                {auctioneer.is_approved ? 'Approved' : 'Review Pending'}
              </Badge>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="font-display text-4xl leading-tight text-slate-950 sm:text-5xl">
                {displayName}, your auction floor is live.
              </h1>
              <p className="text-base leading-7 text-slate-600">
                Track bidding pressure, catalog readiness, fulfillment, and payout movement
                from one operating dashboard.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/org/auctions/new">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Create Auction
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-indigo-100 bg-white/70 text-slate-900 hover:bg-white">
                <Link href="/org/invoices">
                  <Truck className="mr-2 h-4 w-4" />
                  Work Fulfillment
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(79,70,229,0.12)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">7-day bid pulse</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950 tabular-nums">
                  {dashboard.metrics.activeBids.toLocaleString()}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25">
                <Radar className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-6 flex h-32 items-end gap-2">
              {dashboard.bidActivity.map((point) => (
                <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-xl bg-gradient-to-t from-[#4c1d95] via-indigo-500 to-[#daa520]"
                    style={{ height: `${Math.max(8, (point.count / maxBidCount) * 100)}%` }}
                  />
                  <span className="text-[10px] font-medium text-slate-500">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!auctioneer.is_approved && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center">
          <Clock3 className="h-5 w-5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Approval in progress</p>
            <p className="text-amber-800">
              You can stage auctions and build lots now. Public visibility unlocks after review.
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {headlineStats.map((stat) => (
          <div
            key={stat.label}
            className="overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">
                  {stat.value}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.tone} text-white shadow-lg`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">{stat.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {operatingStats.map((stat) => (
          <Card key={stat.label} className="rounded-2xl shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 tabular-nums">
                    {stat.value}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">{stat.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr,0.65fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Upcoming & Live Auctions</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Catalog readiness, bidding pressure, and sale windows.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/org/auctions">
                Manage
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard.upcomingAuctions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
                No upcoming auctions yet.
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.upcomingAuctions.map((auction) => (
                  <Link
                    key={auction.id}
                    href={`/org/auctions/${auction.id}`}
                    className="grid gap-4 rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-indigo-200 hover:bg-white md:grid-cols-[1fr,0.65fr,0.45fr]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-950">
                          {auction.title}
                        </h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusTone[auction.status]}`}>
                          {auction.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Starts {formatDate(auction.startsAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          Ends {formatDate(auction.endsAt)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-lg font-semibold text-slate-950">{auction.lotCount}</p>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Lots</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-3">
                        <p className="text-lg font-semibold text-emerald-700">{auction.bidCount}</p>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700">Bids</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 p-3">
                        <p className="text-lg font-semibold text-amber-700">{formatPercent(auction.readinessScore)}</p>
                        <p className="text-[11px] uppercase tracking-wide text-amber-700">Ready</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <div className="text-left md:text-right">
                        <p className="text-sm font-semibold text-slate-950">
                          {formatUsd(auction.grossBidVolumeCents)}
                        </p>
                        <p className="text-xs text-slate-500">current volume</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Catalog Health</CardTitle>
            <p className="text-sm text-slate-500">Readiness signals across all lots.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Image coverage</span>
                <span className="font-semibold text-slate-950">{formatPercent(catalogImageRate)}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                  style={{ width: `${catalogImageRate}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <ImageIcon className="mb-3 h-5 w-5 text-cyan-600" />
                <p className="text-2xl font-semibold text-slate-950">
                  {dashboard.metrics.lotsWithImages.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">lots with images</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <Zap className="mb-3 h-5 w-5 text-amber-600" />
                <p className="text-2xl font-semibold text-slate-950">
                  {dashboard.metrics.activeBids.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">total bids</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-slate-950">
              <p className="text-sm text-amber-700">Platform commission tracked</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {formatUsd(dashboard.metrics.platformCommissionCents)}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Fulfillment Queue</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Paid invoices waiting on shipment confirmation.
              </p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>{dashboard.metrics.fulfillmentQueueCount} orders</p>
              <p className="font-semibold text-slate-950">
                {formatUsdPrecise(dashboard.metrics.fulfillmentQueueValueCents)}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {dashboard.fulfillmentQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
                No shipments pending.
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.fulfillmentQueue.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="grid gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 md:grid-cols-[1fr,auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Truck className="h-4 w-4 text-amber-600" />
                        <p className="font-semibold text-slate-950">
                          Lot {invoice.lotNumber ?? '-'} &middot; {invoice.lotTitle ?? 'Untitled lot'}
                        </p>
                        <Badge variant="secondary">Awaiting tracking</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Buyer: {invoice.buyerName || invoice.buyerEmail || 'Pending assignment'}</span>
                        {invoice.buyerEmail ? <span>{invoice.buyerEmail}</span> : null}
                        <span>Created {formatDate(invoice.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Auction: {invoice.auctionTitle ?? 'Unknown auction'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
                      <p className="text-lg font-semibold text-slate-950">
                        {formatUsdPrecise(invoice.totalAmount)}
                      </p>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/org/invoices">Update</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Top Lots</CardTitle>
            <p className="text-sm text-slate-500">Lots pulling the strongest bid attention.</p>
          </CardHeader>
          <CardContent>
            {dashboard.topLots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
                Bid activity will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.topLots.map((lot, index) => (
                  <Link
                    key={lot.id}
                    href={`/org/auctions/${lot.auctionId}/lots`}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-indigo-200 hover:bg-white"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-semibold text-white shadow-md shadow-indigo-500/20">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-950">
                        Lot {lot.lotNumber}: {lot.title}
                      </p>
                      <p className="truncate text-xs text-slate-500">{lot.auctionTitle}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{lot.bidCount} bids</span>
                        <span>{lot.imageCount} images</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-950">
                      {formatUsd(lot.highBidCents)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr,0.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Payout Activity</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Escrow releases, commissions, and references.</p>
            </div>
            <Banknote className="h-5 w-5 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {dashboard.recentPayouts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
                Payout records will appear after invoices are released.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 font-semibold">Created</th>
                      <th className="px-3 py-3 font-semibold">Amount</th>
                      <th className="px-3 py-3 font-semibold">Commission</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentPayouts.map((payout) => (
                      <tr key={payout.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 text-slate-600">{formatDate(payout.createdAt)}</td>
                        <td className="px-3 py-3 font-semibold text-slate-950">
                          {formatUsdPrecise(payout.amount)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {formatUsdPrecise(payout.platformCommission)}
                        </td>
                        <td className="px-3 py-3">
                          {payout.isPaid ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-500">{payout.paymentReference || '-'}</td>
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
            <CardTitle className="text-xl">Quick Actions</CardTitle>
            <p className="text-sm text-slate-500">Fast paths into daily auctioneer work.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/org/auctions/new"
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-indigo-200 hover:bg-white"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Gavel className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-950">Create Auction</span>
                  <span className="text-xs text-slate-500">Open a new sale workspace.</span>
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </Link>

            <Link
              href="/org/auctions"
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-indigo-200 hover:bg-white"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                  <PackageOpen className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-950">Manage Catalogs</span>
                  <span className="text-xs text-slate-500">Edit auctions and lot builders.</span>
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </Link>

            <Link
              href="/org/invoices"
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-indigo-200 hover:bg-white"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-950">Invoices & Escrow</span>
                  <span className="text-xs text-slate-500">Ship orders and review releases.</span>
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
