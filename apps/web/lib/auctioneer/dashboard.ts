import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/types/database'

type SupabaseServerClient = SupabaseClient<Database>
type AuctionStatus = Database['public']['Tables']['auctions']['Row']['status']

type AuctionRow = Pick<
  Database['public']['Tables']['auctions']['Row'],
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'created_at'
>

type LotRow = Pick<
  Database['public']['Tables']['lots']['Row'],
  | 'id'
  | 'auction_id'
  | 'lot_number'
  | 'title'
  | 'current_high_bid'
  | 'bid_count'
  | 'is_sold'
  | 'hammer_price'
  | 'estimate_low'
  | 'estimate_high'
  | 'images'
  | 'created_at'
>

type BidRow = Pick<
  Database['public']['Tables']['bids']['Row'],
  'id' | 'lot_id' | 'bidder_id' | 'amount' | 'created_at'
>

type PayoutRow = Pick<
  Database['public']['Tables']['payouts_due']['Row'],
  'id' | 'amount' | 'platform_commission' | 'is_paid' | 'created_at' | 'paid_at' | 'payment_reference'
>

type InvoiceRow = {
  id: string
  total_amount: number
  is_paid: boolean
  paid_at: string | null
  shipping_required: boolean
  is_shipped: boolean
  shipped_at: string | null
  created_at: string
  tracking_number: string | null
  lot: {
    id: string
    lot_number: number | null
    title: string | null
    auction: {
      id: string
      title: string | null
      ends_at: string | null
      auctioneer_id: string | null
    } | null
  } | null
  buyer: {
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

export interface AuctioneerDashboardMetrics {
  totalAuctions: number
  liveAuctions: number
  scheduledAuctions: number
  draftAuctions: number
  completedAuctions: number
  totalLots: number
  lotsWithImages: number
  activeBids: number
  uniqueBidders: number
  grossBidVolumeCents: number
  soldLots: number
  sellThroughRate: number
  averageHammerCents: number
  invoiceReceivablesCents: number
  paidInvoiceCents: number
  pendingInvoiceCents: number
  pendingPayoutCents: number
  paidOutCents: number
  platformCommissionCents: number
  fulfillmentQueueCount: number
  fulfillmentQueueValueCents: number
}

export interface AuctionSummary {
  id: string
  title: string
  status: AuctionStatus
  startsAt: string
  endsAt: string
  lotCount: number
  bidCount: number
  grossBidVolumeCents: number
  readinessScore: number
}

export interface FulfillmentItem {
  id: string
  totalAmount: number
  createdAt: string
  buyerName: string
  buyerEmail: string | null
  lotNumber: number | null
  lotTitle: string | null
  auctionTitle: string | null
  auctionEndsAt: string | null
  trackingNumber: string | null
}

export interface PayoutSummary {
  id: string
  amount: number
  platformCommission: number
  isPaid: boolean
  createdAt: string
  paidAt: string | null
  paymentReference: string | null
}

export interface TopLotSummary {
  id: string
  title: string
  lotNumber: number
  auctionId: string
  auctionTitle: string
  highBidCents: number
  bidCount: number
  imageCount: number
}

export interface BidActivityPoint {
  label: string
  count: number
  volumeCents: number
}

export interface AuctioneerDashboardData {
  metrics: AuctioneerDashboardMetrics
  upcomingAuctions: AuctionSummary[]
  fulfillmentQueue: FulfillmentItem[]
  recentPayouts: PayoutSummary[]
  topLots: TopLotSummary[]
  bidActivity: BidActivityPoint[]
}

const emptyMetrics: AuctioneerDashboardMetrics = {
  totalAuctions: 0,
  liveAuctions: 0,
  scheduledAuctions: 0,
  draftAuctions: 0,
  completedAuctions: 0,
  totalLots: 0,
  lotsWithImages: 0,
  activeBids: 0,
  uniqueBidders: 0,
  grossBidVolumeCents: 0,
  soldLots: 0,
  sellThroughRate: 0,
  averageHammerCents: 0,
  invoiceReceivablesCents: 0,
  paidInvoiceCents: 0,
  pendingInvoiceCents: 0,
  pendingPayoutCents: 0,
  paidOutCents: 0,
  platformCommissionCents: 0,
  fulfillmentQueueCount: 0,
  fulfillmentQueueValueCents: 0,
}

const emptyDashboard: AuctioneerDashboardData = {
  metrics: { ...emptyMetrics },
  upcomingAuctions: [],
  fulfillmentQueue: [],
  recentPayouts: [],
  topLots: [],
  bidActivity: [],
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

function cloneEmptyDashboard(): AuctioneerDashboardData {
  return {
    metrics: { ...emptyMetrics },
    upcomingAuctions: [],
    fulfillmentQueue: [],
    recentPayouts: [],
    topLots: [],
    bidActivity: [],
  }
}

function imageCount(images: Json): number {
  return Array.isArray(images) ? images.length : 0
}

function readinessScore(lots: LotRow[]): number {
  if (lots.length === 0) {
    return 0
  }

  const withImages = lots.filter((lot) => imageCount(lot.images) > 0).length
  const withEstimate = lots.filter((lot) => lot.estimate_low != null || lot.estimate_high != null).length
  const withStartingBid = lots.filter((lot) => lot.current_high_bid > 0 || lot.bid_count > 0).length

  return Math.round(((withImages + withEstimate + withStartingBid) / (lots.length * 3)) * 100)
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildBidActivity(bids: BidRow[]): BidActivityPoint[] {
  const today = new Date()
  const buckets = new Map<string, BidActivityPoint>()

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - offset)
    buckets.set(dayKey(day), {
      label: dayFormatter.format(day),
      count: 0,
      volumeCents: 0,
    })
  }

  for (const bid of bids) {
    const createdAt = new Date(bid.created_at)
    const bucket = buckets.get(dayKey(createdAt))

    if (bucket) {
      bucket.count += 1
      bucket.volumeCents += bid.amount
    }
  }

  return Array.from(buckets.values())
}

function buyerName(invoice: InvoiceRow): string {
  return `${invoice.buyer?.first_name ?? ''} ${invoice.buyer?.last_name ?? ''}`.trim()
}

export async function getAuctioneerDashboard(
  client: SupabaseServerClient,
  auctioneerId: string,
): Promise<AuctioneerDashboardData> {
  if (!auctioneerId) {
    return emptyDashboard
  }

  const dashboard = cloneEmptyDashboard()

  const { data: auctions, error: auctionsError } = await client
    .from('auctions')
    .select('id, title, status, starts_at, ends_at, created_at')
    .eq('auctioneer_id', auctioneerId)
    .order('starts_at', { ascending: true })
    .returns<AuctionRow[]>()

  if (auctionsError) {
    console.error('Failed to load auctioneer auctions:', auctionsError)
    return dashboard
  }

  const auctionRows = auctions ?? []
  const auctionIds = auctionRows.map((auction) => auction.id)
  const auctionTitleById = new Map(auctionRows.map((auction) => [auction.id, auction.title]))

  dashboard.metrics.totalAuctions = auctionRows.length
  dashboard.metrics.liveAuctions = auctionRows.filter((auction) => auction.status === 'live').length
  dashboard.metrics.scheduledAuctions = auctionRows.filter((auction) => auction.status === 'scheduled').length
  dashboard.metrics.draftAuctions = auctionRows.filter((auction) => auction.status === 'draft').length
  dashboard.metrics.completedAuctions = auctionRows.filter((auction) => ['ended', 'completed'].includes(auction.status)).length

  const [lotsResult, payoutsResult, invoicesResult] = await Promise.all([
    auctionIds.length > 0
      ? client
          .from('lots')
          .select('id, auction_id, lot_number, title, current_high_bid, bid_count, is_sold, hammer_price, estimate_low, estimate_high, images, created_at')
          .in('auction_id', auctionIds)
          .returns<LotRow[]>()
      : Promise.resolve({ data: [], error: null }),
    client
      .from('payouts_due')
      .select('id, amount, platform_commission, is_paid, created_at, paid_at, payment_reference')
      .eq('auctioneer_id', auctioneerId)
      .order('created_at', { ascending: false })
      .returns<PayoutRow[]>(),
    client
      .from('invoices')
      .select(`
        id,
        total_amount,
        is_paid,
        paid_at,
        shipping_required,
        is_shipped,
        shipped_at,
        created_at,
        tracking_number,
        lot:lots!inner(
          id,
          lot_number,
          title,
          auction:auctions!inner(
            id,
            title,
            ends_at,
            auctioneer_id
          )
        ),
        buyer:users!buyer_id(
          first_name,
          last_name,
          email
        )
      `)
      .eq('lot.auction.auctioneer_id', auctioneerId)
      .order('created_at', { ascending: false })
      .returns<InvoiceRow[]>(),
  ])

  const lots = lotsResult.data ?? []
  const payouts = payoutsResult.data ?? []
  const invoices = invoicesResult.data ?? []

  if (lotsResult.error) {
    console.error('Failed to load lots for auctioneer dashboard:', lotsResult.error)
  }

  if (payoutsResult.error) {
    console.error('Failed to load payout data for auctioneer dashboard:', payoutsResult.error)
  }

  if (invoicesResult.error) {
    console.error('Failed to load invoice data for auctioneer dashboard:', invoicesResult.error)
  }

  const lotsByAuctionId = new Map<string, LotRow[]>()
  for (const lot of lots) {
    const auctionLots = lotsByAuctionId.get(lot.auction_id) ?? []
    auctionLots.push(lot)
    lotsByAuctionId.set(lot.auction_id, auctionLots)
  }

  dashboard.metrics.totalLots = lots.length
  dashboard.metrics.lotsWithImages = lots.filter((lot) => imageCount(lot.images) > 0).length
  dashboard.metrics.activeBids = lots.reduce((sum, lot) => sum + lot.bid_count, 0)
  dashboard.metrics.grossBidVolumeCents = lots.reduce((sum, lot) => sum + lot.current_high_bid, 0)
  dashboard.metrics.soldLots = lots.filter((lot) => lot.is_sold || lot.hammer_price != null).length
  dashboard.metrics.sellThroughRate =
    lots.length > 0 ? Math.round((dashboard.metrics.soldLots / lots.length) * 100) : 0

  const soldHammerTotal = lots.reduce((sum, lot) => sum + (lot.hammer_price ?? 0), 0)
  dashboard.metrics.averageHammerCents =
    dashboard.metrics.soldLots > 0 ? Math.round(soldHammerTotal / dashboard.metrics.soldLots) : 0

  const lotIds = lots.map((lot) => lot.id)
  let bids: BidRow[] = []

  if (lotIds.length > 0) {
    const { data: bidRows, error: bidsError } = await client
      .from('bids')
      .select('id, lot_id, bidder_id, amount, created_at')
      .in('lot_id', lotIds)
      .order('created_at', { ascending: false })
      .limit(500)
      .returns<BidRow[]>()

    if (bidsError) {
      console.error('Failed to load bid activity for auctioneer dashboard:', bidsError)
    } else {
      bids = bidRows ?? []
      dashboard.metrics.uniqueBidders = new Set(bids.map((bid) => bid.bidder_id)).size
    }
  }

  dashboard.bidActivity = buildBidActivity(bids)

  dashboard.upcomingAuctions = auctionRows
    .filter((auction) => ['draft', 'scheduled', 'live'].includes(auction.status))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 6)
    .map((auction) => {
      const auctionLots = lotsByAuctionId.get(auction.id) ?? []

      return {
        id: auction.id,
        title: auction.title,
        status: auction.status,
        startsAt: auction.starts_at,
        endsAt: auction.ends_at,
        lotCount: auctionLots.length,
        bidCount: auctionLots.reduce((sum, lot) => sum + lot.bid_count, 0),
        grossBidVolumeCents: auctionLots.reduce((sum, lot) => sum + lot.current_high_bid, 0),
        readinessScore: readinessScore(auctionLots),
      }
    })

  dashboard.topLots = lots
    .filter((lot) => lot.current_high_bid > 0 || lot.bid_count > 0)
    .sort((a, b) => b.current_high_bid - a.current_high_bid || b.bid_count - a.bid_count)
    .slice(0, 5)
    .map((lot) => ({
      id: lot.id,
      title: lot.title,
      lotNumber: lot.lot_number,
      auctionId: lot.auction_id,
      auctionTitle: auctionTitleById.get(lot.auction_id) ?? 'Auction',
      highBidCents: lot.current_high_bid,
      bidCount: lot.bid_count,
      imageCount: imageCount(lot.images),
    }))

  dashboard.metrics.invoiceReceivablesCents = invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0)
  dashboard.metrics.paidInvoiceCents = invoices
    .filter((invoice) => invoice.is_paid)
    .reduce((sum, invoice) => sum + invoice.total_amount, 0)
  dashboard.metrics.pendingInvoiceCents = invoices
    .filter((invoice) => !invoice.is_paid)
    .reduce((sum, invoice) => sum + invoice.total_amount, 0)

  const pendingFulfillment = invoices.filter((invoice) => invoice.is_paid && !invoice.is_shipped)

  dashboard.fulfillmentQueue = pendingFulfillment
    .slice(0, 6)
    .map((invoice) => ({
      id: invoice.id,
      totalAmount: invoice.total_amount,
      createdAt: invoice.created_at,
      buyerName: buyerName(invoice),
      buyerEmail: invoice.buyer?.email ?? null,
      lotNumber: invoice.lot?.lot_number ?? null,
      lotTitle: invoice.lot?.title ?? null,
      auctionTitle: invoice.lot?.auction?.title ?? null,
      auctionEndsAt: invoice.lot?.auction?.ends_at ?? null,
      trackingNumber: invoice.tracking_number ?? null,
    }))

  dashboard.metrics.fulfillmentQueueCount = pendingFulfillment.length
  dashboard.metrics.fulfillmentQueueValueCents = pendingFulfillment.reduce(
    (sum, invoice) => sum + invoice.total_amount,
    0,
  )

  dashboard.metrics.pendingPayoutCents = payouts
    .filter((payout) => !payout.is_paid)
    .reduce((sum, payout) => sum + payout.amount, 0)
  dashboard.metrics.paidOutCents = payouts
    .filter((payout) => payout.is_paid)
    .reduce((sum, payout) => sum + payout.amount, 0)
  dashboard.metrics.platformCommissionCents = payouts.reduce(
    (sum, payout) => sum + payout.platform_commission,
    0,
  )

  dashboard.recentPayouts = payouts.slice(0, 5).map((payout) => ({
    id: payout.id,
    amount: payout.amount,
    platformCommission: payout.platform_commission,
    isPaid: payout.is_paid,
    createdAt: payout.created_at,
    paidAt: payout.paid_at,
    paymentReference: payout.payment_reference,
  }))

  return dashboard
}
