import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LotDetail } from '@/components/marketplace/lot-detail'
import { LotBiddingSidebar } from '@/components/marketplace/lot-bidding-sidebar'

interface Props {
  params: Promise<{
    id: string
  }>
}

export default async function LotDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Get lot with auction and auctioneer info
  const { data: lot } = await supabase
    .from('lots')
    .select(`
      *,
      auctions (
        *,
        auctioneers (
          company_name,
          is_approved
        )
      )
    `)
    .eq('id', id)
    .single()

  if (!lot) return notFound()

  const auction = lot.auctions

  // Get current user for authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // All live auctions are viewable
  const canView = auction.status === 'live' || auction.status === 'scheduled'

  if (!canView) {
    return notFound()
  }

  // Get current user profile for bidding
  let userProfile = null
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    userProfile = data
  }

  // Get bid history (bids table has bidder_id -> users.id foreign key)
  const { data: bids } = await supabase
    .from('bids')
    .select(`
      *,
      users:bidder_id (
        first_name,
        last_name,
        email
      )
    `)
    .eq('lot_id', lot.id)
    .order('created_at', { ascending: false })

  // Get user's wallet balance if logged in
  let walletBalance = 0
  if (user) {
    const { data: walletData } = await supabase
      .from('wallet_ledger')
      .select('amount, transaction_type')
      .eq('user_id', user.id)

    if (walletData) {
      walletBalance = walletData.reduce((balance, transaction) => {
        switch (transaction.transaction_type) {
          case 'purchase':
          case 'bid_refund':
          case 'escrow_release':
            return balance + transaction.amount
          case 'bid_hold':
          case 'escrow_hold':
            return balance - transaction.amount
          default:
            return balance
        }
      }, 0)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Lot Details */}
          <div className="lg:col-span-2">
            <LotDetail lot={lot} auction={auction} />
          </div>

          {/* Sidebar - Bidding & History */}
          <div className="lg:col-span-1">
            <LotBiddingSidebar
              lot={lot}
              auction={auction}
              user={userProfile}
              walletBalance={walletBalance}
              initialBids={bids || []}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
