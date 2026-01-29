import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LotDetail } from '@/components/marketplace/lot-detail'
import { BiddingPanel } from '@/components/marketplace/bidding-panel'
import { BidHistory } from '@/components/marketplace/bid-history'

interface Props {
  params: {
    id: string
  }
}

export default async function LotDetailPage({ params }: Props) {
  const supabase = await createClient()

  // Get lot with auction and auctioneer info
  const { data: lot } = await supabase
    .from('lots')
    .select(`
      *,
      auctions (
        *,
        auctioneers (
          organization_name,
          slug,
          approved
        )
      )
    `)
    .eq('id', params.id)
    .single()

  if (!lot) return notFound()

  const auction = lot.auctions

  // TEMPORARY: Skip auth checks for development - allow all lots to be viewed
  // Check if lot is accessible
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // let canView = auction.status === 'live' && auction.auctioneers?.approved

  // Allow owners to view their own lots
  // if (user) {
  //   const { data: auctioneer } = await supabase
  //     .from('auctioneers')
  //     .select('id')
  //     .eq('user_id', user.id)
  //     .single()

  //   if (auctioneer && auction.auctioneer_id === auctioneer.id) {
  //     canView = true
  //   }

  //   // Allow admins to view all lots
  //   const { data: userProfile } = await supabase
  //     .from('users')
  //     .select('role')
  //     .eq('id', user.id)
  //     .single()

  //   if (userProfile?.role === 'admin') {
  //     canView = true
  //   }
  // }

  // if (!canView) return notFound()

  // TEMPORARY: Allow viewing all lots for development
  const canView = true

  // TEMPORARY: Skip user profile query for development
  // Get current user profile for bidding
  // let userProfile = null
  // if (user) {
  //   const { data } = await supabase
  //     .from('users')
  //     .select('*')
  //     .eq('id', user.id)
  //     .single()
  //   userProfile = data
  // }

  // TEMPORARY: Use dummy user profile for development
  const userProfile = {
    id: 'dummy-user-id',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'bidder'
  }

  // Get bid history
  const { data: bids } = await supabase
    .from('bids')
    .select(`
      *,
      users (
        first_name,
        last_name,
        email
      )
    `)
    .eq('lot_id', lot.id)
    .order('created_at', { ascending: false })

  // TEMPORARY: Skip wallet balance query for development
  // Get user's wallet balance if logged in
  // let walletBalance = 0
  // if (user) {
  //   const { data: walletData } = await supabase
  //     .from('wallet_ledger')
  //     .select('amount_itc, type')
  //     .eq('user_id', user.id)

  //   if (walletData) {
  //     walletBalance = walletData.reduce((balance, transaction) => {
  //       switch (transaction.type) {
  //         case 'purchase':
  //         case 'bid_refund':
  //         case 'escrow_release':
  //           return balance + transaction.amount_itc
  //         case 'bid_spend':
  //         case 'escrow_hold':
  //           return balance - transaction.amount_itc
  //         default:
  //           return balance
  //       }
  //     }, 0)
  //   }
  // }

  // TEMPORARY: Use dummy wallet balance for development
  const walletBalance = 1000

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Lot Details */}
          <div className="lg:col-span-2">
            <LotDetail lot={lot} auction={auction} />
          </div>

          {/* Sidebar - Bidding & History */}
          <div className="lg:col-span-1 space-y-6">
            {/* Bidding Panel */}
            <BiddingPanel
              lot={lot}
              auction={auction}
              user={userProfile}
              walletBalance={walletBalance}
              currentBids={bids || []}
            />

            {/* Bid History */}
            <BidHistory
              lot={lot}
              bids={bids || []}
              currentUser={userProfile}
            />
          </div>
        </div>
      </div>
    </div>
  )
}