import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/types/database'

type SupabaseServerClient = SupabaseClient<Database>

type AuctionRow = Pick<
  Database['public']['Tables']['auctions']['Row'],
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at'
>

type LotRow = Pick<Database['public']['Tables']['lots']['Row'], 'auction_id'>

type PayoutRow = Pick<
  Database['public']['Tables']['payouts_due']['Row'],
  'id' | 'amount' | 'is_paid' | 'created_at' | 'paid_at' | 'payment_reference'
>

type FulfillmentRow = {
  id: string
  total_amount: number
  created_at: string
  tracking_number: string | null
  lot: {
    lot_number: number | null
    title: string | null
    auction: {
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
  completedAuctions: number
  totalLots: number
  pendingPayoutCents: number
  paidOutCents: number
  fulfillmentQueueCount: number
  fulfillmentQueueValueCents: number
}

export interface AuctionSummary {
  id: string
  title: string
  status: Database['public']['Tables']['auctions']['Row']['status']
  startsAt: string
  endsAt: string
  lotCount: number
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
  isPaid: boolean
  createdAt: string
  paidAt: string | null
  paymentReference: string | null
}

export interface AuctioneerDashboardData {
  metrics: AuctioneerDashboardMetrics
  upcomingAuctions: AuctionSummary[]
  fulfillmentQueue: FulfillmentItem[]
  recentPayouts: PayoutSummary[]
}

const emptyDashboard: AuctioneerDashboardData = {
  metrics: {
    totalAuctions: 0,
    liveAuctions: 0,
    scheduledAuctions: 0,
    completedAuctions: 0,
    totalLots: 0,
    pendingPayoutCents: 0,
    paidOutCents: 0,
    fulfillmentQueueCount: 0,
    fulfillmentQueueValueCents: 0,
  },
  upcomingAuctions: [],
  fulfillmentQueue: [],
  recentPayouts: [],
}

export async function getAuctioneerDashboard(
  client: SupabaseServerClient,
  auctioneerId: string,
): Promise<AuctioneerDashboardData> {
  if (!auctioneerId) {
    return emptyDashboard
  }

  const dashboard: AuctioneerDashboardData = {
    metrics: { ...emptyDashboard.metrics },
    upcomingAuctions: [...emptyDashboard.upcomingAuctions],
    fulfillmentQueue: [...emptyDashboard.fulfillmentQueue],
    recentPayouts: [...emptyDashboard.recentPayouts],
  }

  const [auctionsResult, payoutsResult, fulfillmentResult] = await Promise.all([
    client
      .from('auctions')
      .select('id, title, status, starts_at, ends_at')
      .eq('auctioneer_id', auctioneerId)
      .order('starts_at', { ascending: true })
      .returns<AuctionRow[]>(),
    client
      .from('payouts_due')
      .select('id, amount, is_paid, created_at, paid_at, payment_reference')
      .eq('auctioneer_id', auctioneerId)
      .order('created_at', { ascending: false })
      .limit(10)
      .returns<PayoutRow[]>(),
    client
      .from('invoices')
      .select(`
        id,
        total_amount,
        created_at,
        tracking_number,
        lot:lots!inner(
          lot_number,
          title,
          auction:auctions!inner(
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
      .eq('is_paid', true)
      .eq('is_shipped', false)
      .eq('lot.auction.auctioneer_id', auctioneerId)
      .order('created_at', { ascending: false })
      .limit(5)
      .returns<FulfillmentRow[]>(),
  ])

  const { data: auctions, error: auctionsError } = auctionsResult

  if (auctionsError) {
    console.error('Failed to load auctioneer auctions:', auctionsError)
    return dashboard
  }

  const auctionIds = auctions?.map((auction) => auction.id) ?? []

  dashboard.metrics.totalAuctions = auctions?.length ?? 0
  dashboard.metrics.liveAuctions = auctions?.filter((auction) => auction.status === 'live').length ?? 0
  dashboard.metrics.scheduledAuctions = auctions?.filter((auction) => auction.status === 'scheduled' || auction.status === 'draft').length ?? 0
  dashboard.metrics.completedAuctions = auctions?.filter((auction) => auction.status === 'completed').length ?? 0

  const lotsPerAuction: Record<string, number> = {}

  if (auctionIds.length > 0) {
    const { data: lots, error: lotsError } = await client
      .from('lots')
      .select('auction_id')
      .in('auction_id', auctionIds)
      .returns<LotRow[]>()

    if (!lotsError && lots) {
      dashboard.metrics.totalLots = lots.length

      for (const lot of lots) {
        lotsPerAuction[lot.auction_id] = (lotsPerAuction[lot.auction_id] || 0) + 1
      }
    } else if (lotsError) {
      console.error('Failed to load lots for auctioneer dashboard:', lotsError)
    }
  }

  dashboard.upcomingAuctions = (auctions || [])
    .filter((auction) => ['draft', 'scheduled', 'live'].includes(auction.status))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5)
    .map((auction) => ({
      id: auction.id,
      title: auction.title,
      status: auction.status,
      startsAt: auction.starts_at,
      endsAt: auction.ends_at,
      lotCount: lotsPerAuction[auction.id] || 0,
    }))

  const { data: payouts, error: payoutsError } = payoutsResult

  if (!payoutsError && payouts) {
    dashboard.metrics.pendingPayoutCents = payouts
      .filter((payout) => !payout.is_paid)
      .reduce((sum, payout) => sum + payout.amount, 0)

    dashboard.metrics.paidOutCents = payouts
      .filter((payout) => payout.is_paid)
      .reduce((sum, payout) => sum + payout.amount, 0)

    dashboard.recentPayouts = payouts.slice(0, 5).map((payout) => ({
      id: payout.id,
      amount: payout.amount,
      isPaid: payout.is_paid,
      createdAt: payout.created_at,
      paidAt: payout.paid_at,
      paymentReference: payout.payment_reference,
    }))
  } else {
    console.error('Failed to load payout data for auctioneer dashboard:', payoutsError)
  }

  const { data: fulfillment, error: fulfillmentError } = fulfillmentResult

  if (!fulfillmentError && fulfillment) {
    dashboard.fulfillmentQueue = fulfillment.map((invoice) => ({
      id: invoice.id,
      totalAmount: invoice.total_amount,
      createdAt: invoice.created_at,
      buyerName: `${invoice.buyer?.first_name ?? ''} ${invoice.buyer?.last_name ?? ''}`.trim(),
      buyerEmail: invoice.buyer?.email ?? null,
      lotNumber: invoice.lot?.lot_number ?? null,
      lotTitle: invoice.lot?.title ?? null,
      auctionTitle: invoice.lot?.auction?.title ?? null,
      auctionEndsAt: invoice.lot?.auction?.ends_at ?? null,
      trackingNumber: invoice.tracking_number ?? null,
    }))

    dashboard.metrics.fulfillmentQueueCount = dashboard.fulfillmentQueue.length
    dashboard.metrics.fulfillmentQueueValueCents = dashboard.fulfillmentQueue.reduce(
      (sum, invoice) => sum + invoice.totalAmount,
      0,
    )
  } else {
    console.error('Failed to load fulfillment queue for auctioneer dashboard:', fulfillmentError)
  }

  return dashboard
}
