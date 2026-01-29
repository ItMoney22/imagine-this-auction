import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LotGrid } from '@/components/marketplace/lot-grid'
import { AuctionHeader } from '@/components/marketplace/auction-header'
import { AuctionInfo } from '@/components/marketplace/auction-info'

interface Props {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    search?: string
    category?: string
    sort?: string
  }>
}

export default async function AuctionDetailPage({ params: routeParamsPromise, searchParams }: Props) {
  const routeParams = await routeParamsPromise
  const params = await searchParams
  const supabase = await createClient()

  // Get auction with auctioneer info
  const { data: auction } = await supabase
    .from('auctions')
    .select(`
      *,
      auctioneers (
        company_name,
        id,
        is_approved
      )
    `)
    .eq('id', routeParams.id)
    .single()

  if (!auction) return notFound()

  // TEMPORARY: Skip auth checks for development - allow all auctions to be viewed
  // Check if auction is accessible (live/published or user owns it)
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // let canView = auction.status === 'live' && auction.auctioneers?.approved

  // Allow owners to view their own auctions
  // if (user) {
  //   const { data: auctioneer } = await supabase
  //     .from('auctioneers')
  //     .select('id')
  //     .eq('user_id', user.id)
  //     .single()

  //   if (auctioneer && auction.auctioneer_id === auctioneer.id) {
  //     canView = true
  //   }

  //   // Allow admins to view all auctions
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

  // TEMPORARY: Allow viewing all auctions for development
  const canView = true

  // Build lots query
  let lotsQuery = supabase
    .from('lots')
    .select(`
      *,
      bids (
        id,
        amount_itc,
        created_at,
        users (
          first_name,
          last_name
        )
      )
    `)
    .eq('auction_id', auction.id)

  // Apply search filter
  if (params.search) {
    lotsQuery = lotsQuery.or(
      `title.ilike.%${params.search}%,description.ilike.%${params.search}%`
    )
  }

  // Apply category filter
  if (params.category) {
    lotsQuery = lotsQuery.eq('category', params.category)
  }

  // Apply sorting
  switch (params.sort) {
    case 'lot_number':
      lotsQuery = lotsQuery.order('lot_number', { ascending: true })
      break
    case 'price_low':
      lotsQuery = lotsQuery.order('start_price_itc', { ascending: true })
      break
    case 'price_high':
      lotsQuery = lotsQuery.order('start_price_itc', { ascending: false })
      break
    case 'title':
      lotsQuery = lotsQuery.order('title', { ascending: true })
      break
    default:
      lotsQuery = lotsQuery.order('lot_number', { ascending: true })
  }

  const { data: lots } = await lotsQuery

  // Get unique categories for filtering
  const { data: categories } = await supabase
    .from('lots')
    .select('category')
    .eq('auction_id', auction.id)
    .not('category', 'is', null)
    .order('category')

  const uniqueCategories = Array.from(
    new Set(categories?.map(c => c.category).filter(Boolean))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Auction Header */}
        <AuctionHeader auction={auction} />

        {/* Auction Info & Lots Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
          {/* Sidebar - Auction Info */}
          <div className="lg:col-span-1">
            <AuctionInfo
              auction={auction}
              lotCount={lots?.length || 0}
              categories={uniqueCategories}
            />
          </div>

          {/* Main Content - Lots */}
          <div className="lg:col-span-3">
            <LotGrid
              lots={lots || []}
              auction={auction}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
