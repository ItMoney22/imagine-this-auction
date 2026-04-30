import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { Trophy, Wallet, Gavel, Eye } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userProfile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!userProfile) redirect('/login')
  if (userProfile.role === 'admin') redirect('/admin')
  if (userProfile.role === 'auctioneer') redirect('/org')

  // Fetch in parallel
  const [
    { data: walletEntries },
    { data: myBids },
    { data: wonInvoices },
    { data: watchlist },
    { data: stats },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from('wallet_ledger')
      .select('amount, transaction_type')
      .eq('user_id', user.id),
    supabase
      .from('bids')
      .select('id, lot_id, amount, created_at, lots!inner(id, title, current_high_bid, auction_id, auctions!inner(ends_at))')
      .eq('bidder_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, total_amount, is_paid')
      .eq('buyer_id', user.id),
    supabase
      .from('watchlists')
      .select('lot_id', { count: 'exact', head: false })
      .eq('user_id', user.id),
    supabase
      .from('bidder_stats')
      .select('lots_won, lifetime_spend_cents, tier')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('bids')
      .select('id, amount, created_at, lots!inner(id, title, current_high_bid, auction_id, auctions!inner(ends_at, title))')
      .eq('bidder_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const walletBalance = (walletEntries || []).reduce((balance, entry) => {
    switch (entry.transaction_type) {
      case 'purchase':
      case 'bid_refund':
      case 'escrow_release':
        return balance + entry.amount
      case 'bid_hold':
      case 'escrow_hold':
      case 'payout':
        return balance - entry.amount
      default:
        return balance
    }
  }, 0)

  const now = new Date()
  const activeLotIds = new Set<string>()
  const winningLotIds = new Set<string>()
  for (const b of myBids || []) {
    const auction = (b.lots as any)?.auctions
    if (!auction) continue
    const endsAt = new Date(auction.ends_at)
    if (endsAt > now) {
      activeLotIds.add(b.lot_id)
      if ((b.lots as any).current_high_bid === b.amount) {
        winningLotIds.add(b.lot_id)
      }
    }
  }

  const activeBids = activeLotIds.size
  const winningCount = winningLotIds.size
  const watchingCount = watchlist?.length ?? 0
  const wonItems = (wonInvoices || []).length
  const unpaidInvoiceCount = (wonInvoices || []).filter((i: any) => !i.is_paid).length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {userProfile.first_name || userProfile.email}!
          </h1>
          <p className="text-gray-600 mt-2">
            {stats?.tier && (
              <span className="inline-flex items-center gap-1 mr-2 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                <Trophy className="h-3 w-3" />
                {stats.tier} bidder
              </span>
            )}
            Your bidder dashboard — manage your bids, wallet, and account
          </p>
        </div>
        <Link
          href="/lots"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Browse Lots
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Wallet Balance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Wallet</h2>
            <Wallet className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-green-600 mb-2">
            {formatCurrency(walletBalance)}
          </div>
          <p className="text-xs text-gray-500 mb-4">Available credits</p>
          <Link
            href="/wallet"
            className="block w-full rounded bg-blue-600 px-4 py-2 text-center text-sm text-white hover:bg-blue-700"
          >
            Add Credits
          </Link>
        </div>

        {/* Active Bids */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Active Bids</h2>
            <Gavel className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-blue-600 mb-2">{activeBids}</div>
          <p className="text-xs text-gray-500 mb-4">
            <span className="font-semibold text-emerald-600">{winningCount} winning</span>
            {activeBids > winningCount && ` · ${activeBids - winningCount} outbid`}
          </p>
          <Link
            href="/lots"
            className="block w-full rounded bg-gray-100 px-4 py-2 text-center text-sm text-gray-700 hover:bg-gray-200"
          >
            View All Bids
          </Link>
        </div>

        {/* Watching */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Watching</h2>
            <Eye className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-pink-600 mb-2">{watchingCount}</div>
          <p className="text-xs text-gray-500 mb-4">Lots in your watchlist</p>
          <Link
            href="/lots"
            className="block w-full rounded bg-gray-100 px-4 py-2 text-center text-sm text-gray-700 hover:bg-gray-200"
          >
            Browse Lots
          </Link>
        </div>

        {/* Won Auctions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Won</h2>
            <Trophy className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-purple-600 mb-2">
            {stats?.lots_won ?? wonItems}
          </div>
          <p className="text-xs text-gray-500 mb-4">
            {unpaidInvoiceCount > 0 ? (
              <span className="text-amber-600 font-medium">
                {unpaidInvoiceCount} unpaid invoice{unpaidInvoiceCount === 1 ? '' : 's'}
              </span>
            ) : (
              'All caught up'
            )}
          </p>
          <Link
            href="/invoices"
            className="block w-full rounded bg-gray-100 px-4 py-2 text-center text-sm text-gray-700 hover:bg-gray-200"
          >
            View Won Items
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <Link href="/lots" className="text-sm text-blue-600 hover:text-blue-800">
            Browse more →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {recentActivity && recentActivity.length > 0 ? (
            recentActivity.map((b: any) => {
              const isWinning = b.lots?.current_high_bid === b.amount
              const auctionEnded = new Date(b.lots?.auctions?.ends_at) < now
              return (
                <Link
                  key={b.id}
                  href={`/lots/${b.lot_id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{b.lots?.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {b.lots?.auctions?.title} · Bid {formatCurrency(b.amount)} ·{' '}
                      {new Date(b.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${
                      auctionEnded
                        ? isWinning
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-600'
                        : isWinning
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {auctionEnded ? (isWinning ? 'Won' : 'Lost') : isWinning ? 'Winning' : 'Outbid'}
                  </span>
                </Link>
              )
            })
          ) : (
            <div className="text-center text-gray-500 py-12">
              <p>No bids yet</p>
              <p className="text-sm mt-2">
                <Link href="/lots" className="text-blue-600 hover:underline">
                  Browse lots
                </Link>{' '}
                to start bidding
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
