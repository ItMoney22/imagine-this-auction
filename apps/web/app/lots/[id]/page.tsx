import { AuctionDiscussion } from '@/components/community/discussions'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LotDetail } from '@/components/marketplace/lot-detail'
import { LotBiddingSidebar } from '@/components/marketplace/lot-bidding-sidebar'
import { computeWalletBalance } from '@/lib/wallet/balance'
import type { LotImageRecord } from '@/lib/ai/quick-listing'

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

    walletBalance = computeWalletBalance(walletData)
  }

  // Imagery: verified originals are the buyer's source of truth and are shown
  // first. AI presentation images live in their own labelled section.
  const { data: lotImages } = await supabase
    .from('lot_images')
    .select('*')
    .eq('lot_id', lot.id)
    .order('position', { ascending: true })

  const allImages = (lotImages ?? []) as unknown as LotImageRecord[]
  const originalImages = allImages.filter((image) => image.kind === 'original')
  const generatedImages = allImages.filter(
    (image) => image.kind === 'ai_generated' && image.moderation_status !== 'blocked'
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Lot Details */}
          <div className="lg:col-span-2">
            <AuctionDiscussion lotId={lot.id} auctionId={auction.id} />
            <LotDetail
              lot={lot}
              auction={auction}
              originalImages={originalImages}
              generatedImages={generatedImages}
            />
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
