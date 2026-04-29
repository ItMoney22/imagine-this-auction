import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!userProfile) {
    redirect('/login')
  }

  if (userProfile.role === 'admin') {
    redirect('/admin')
  }

  if (userProfile.role === 'auctioneer') {
    redirect('/org')
  }

  const [{ data: walletEntries }, activeBidsResult, wonItemsResult] = await Promise.all([
    supabase
      .from('wallet_ledger')
      .select('amount, transaction_type')
      .eq('user_id', user.id),
    supabase
      .from('bids')
      .select('id', { count: 'exact', head: true })
      .eq('bidder_id', user.id),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', user.id)
      .eq('is_paid', false),
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

  const activeBids = activeBidsResult.count || 0
  const wonItems = wonItemsResult.count || 0

  // Default bidder dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {userProfile.first_name || userProfile.email}!
        </h1>
        <p className="text-gray-600 mt-2">
          Your bidder dashboard - manage your bids, wallet, and account
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Wallet Balance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ITC Wallet</h2>
          <div className="text-3xl font-bold text-green-600 mb-2">{walletBalance} ITC</div>
          <p className="text-sm text-gray-600 mb-4">Available credits</p>
          <Link
            href="/wallet"
            className="block w-full rounded bg-blue-600 px-4 py-2 text-center text-white transition-colors hover:bg-blue-700"
          >
            Add Credits
          </Link>
        </div>

        {/* Active Bids */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Bids</h2>
          <div className="text-3xl font-bold text-blue-600 mb-2">{activeBids}</div>
          <p className="text-sm text-gray-600 mb-4">Current auctions</p>
          <Link
            href="/auctions"
            className="block w-full rounded bg-gray-200 px-4 py-2 text-center text-gray-700 transition-colors hover:bg-gray-300"
          >
            View All Bids
          </Link>
        </div>

        {/* Won Auctions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Won Items</h2>
          <div className="text-3xl font-bold text-purple-600 mb-2">{wonItems}</div>
          <p className="text-sm text-gray-600 mb-4">Pending payment</p>
          <Link
            href="/invoices"
            className="block w-full rounded bg-gray-200 px-4 py-2 text-center text-gray-700 transition-colors hover:bg-gray-300"
          >
            View Won Items
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="p-6">
          <div className="text-center text-gray-500 py-8">
            <p>No recent activity</p>
            <p className="text-sm mt-2">Start bidding on auctions to see your activity here</p>
          </div>
        </div>
      </div>
    </div>
  )
}
