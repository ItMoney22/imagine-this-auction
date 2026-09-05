'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { formatPremiumPercent, formatUsd, premiumPercentForAuction } from '@/lib/pricing/premium'
import {
  ArrowLeft,
  Gavel,
  Package,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  Box,
} from 'lucide-react'
import { WatchButton } from '@/components/marketplace/watch-button'
import { LotImageGallery } from '@/components/marketplace/lot-image-gallery'
import { PremiumDisclosure } from '@/components/marketplace/premium-disclosure'
import type { LotImageRecord } from '@/lib/ai/quick-listing'
import type { Database } from '@/lib/types/database'

type LotRow = Database['public']['Tables']['lots']['Row']
type AuctionRow = Database['public']['Tables']['auctions']['Row']
type AuctioneerRow = Database['public']['Tables']['auctioneers']['Row']

/** The lot as app/lots/[id]/page.tsx selects it. */
interface LotDetailLot extends LotRow {
  /** USDZ for AR Quick Look; added by a later migration than the generated types. */
  ar_model_url?: string | null
}

/** The auction as app/lots/[id]/page.tsx selects it: the row plus the joined auctioneer. */
interface LotDetailAuction extends AuctionRow {
  auctioneers?: Partial<Pick<AuctioneerRow, 'company_name' | 'is_approved'>> | null
}

interface LotDetailProps {
  lot: LotDetailLot
  auction: LotDetailAuction
  /** Verified, unaltered buyer-facing photos. */
  originalImages?: LotImageRecord[]
  /** AI presentation mockups — never the item's evidence. */
  generatedImages?: LotImageRecord[]
}

export function LotDetail({
  lot,
  auction,
  originalImages = [],
  generatedImages = [],
}: LotDetailProps) {
  // Legacy fallback: lots created before lot_images existed keep their URLs on
  // `lots.images`. Those uploads were never AI-touched, so they are originals.
  let legacyImages: string[] = []
  try {
    const raw: unknown = typeof lot.images === 'string' ? JSON.parse(lot.images) : lot.images
    if (Array.isArray(raw)) {
      legacyImages = raw.filter((url): url is string => typeof url === 'string')
    }
  } catch {
    legacyImages = []
  }

  // LOAD-TIME SNAPSHOT. `lot` is the row as it stood when the page rendered on
  // the server. The BiddingPanel in the sidebar subscribes to new bids and
  // keeps its own current-high-bid figure live, so once a lot has bids this
  // value can fall behind it. To keep the page from ever showing two
  // different totals, the opening-bid figure and the full premium disclosure
  // are rendered here only while there are no bids (an opening bid cannot
  // change under the reader). Once bids exist, BiddingPanel renders the
  // disclosure against the live next bid, and this header states only the
  // percent.
  const hasBids = Number(lot.bid_count) > 0 && Number(lot.current_high_bid) > 0
  const openingBidCents = Number(lot.starting_bid) || 0
  // null when the auction record did not arrive whole; never guessed.
  const premiumPct = premiumPercentForAuction(auction)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Link href="/auctions" className="hover:text-blue-600">
          Auctions
        </Link>
        <span>/</span>
        <Link href={`/auctions/${auction.id}`} className="hover:text-blue-600">
          {auction.title}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Lot #{lot.lot_number}</span>
      </div>

      {/* Back button */}
      <Button variant="outline" asChild>
        <Link href={`/auctions/${auction.id}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Auction
        </Link>
      </Button>

      {/* Lot Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">Lot #{lot.lot_number}</Badge>
                {lot.category && (
                  <Badge variant="secondary">{lot.category}</Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {lot.title}
              </h1>
              {/* Opening bid only: once bids exist the live figure lives in the bidding panel. */}
              {!hasBids && (
                <div className="mt-4 flex items-center">
                  <Gavel className="h-5 w-5 text-gray-400 mr-3" aria-hidden="true" />
                  <div>
                    <div className="text-sm text-gray-600">Opening Bid</div>
                    <div className="text-2xl font-bold text-gray-900 tabular-nums">
                      {formatUsd(openingBidCents)}
                    </div>
                  </div>
                </div>
              )}
              {premiumPct !== null ? (
                hasBids ? (
                  <p className="mt-3 text-sm text-gray-700">
                    Buyer&apos;s premium {formatPremiumPercent(premiumPct)}. Your all-in total appears with the
                    bid button.
                  </p>
                ) : (
                  <PremiumDisclosure
                    className="mt-3"
                    hammerCents={openingBidCents}
                    premiumPct={premiumPct}
                    bidLabel="opening bid"
                  />
                )
              ) : (
                <p className="mt-3 text-sm text-gray-600">
                  Buyer&apos;s premium is set by the auctioneer; see the auction terms.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 self-start flex-wrap">
              <WatchButton lotId={lot.id} variant="pill" showCount />
              {lot.ar_model_url && (
                <Button variant="outline" size="sm" asChild>
                  {/* iOS Safari renders this natively as AR Quick Look */}
                  <a rel="ar" href={lot.ar_model_url}>
                    <Box className="h-4 w-4 mr-2" />
                    View in your room
                  </a>
                </Button>
              )}
              {lot.reserve_price && (
                <Badge variant="destructive">
                  Reserve: {formatUsd(lot.reserve_price)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Images — verified originals first and by default */}
      <LotImageGallery
        title={lot.title}
        originalImages={originalImages}
        generatedImages={generatedImages}
        legacyImageUrls={legacyImages}
      />

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {lot.description}
          </p>
        </CardContent>
      </Card>

      {/* Lot Details */}
      <Card>
        <CardHeader>
          <CardTitle>Lot Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Starting Price</div>
                  <div className="font-medium">{formatUsd(lot.starting_bid)}</div>
                </div>
              </div>

              <div className="flex items-center">
                <TrendingUp className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Bid Increment</div>
                  <div className="font-medium">{formatUsd(lot.increment)}</div>
                </div>
              </div>

              {lot.reserve_price && (
                <div className="flex items-center">
                  <Package className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm text-gray-600">Reserve Price</div>
                    <div className="font-medium text-red-600">
                      {formatUsd(lot.reserve_price)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {lot.category && (
                <div className="flex items-center">
                  <Package className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <div className="text-sm text-gray-600">Category</div>
                    <div className="font-medium">{lot.category}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Auction Status</div>
                  <div className="font-medium">
                    {auction.status === 'live' ? 'Live Auction' : 'Draft'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auction Information */}
      <Card>
        <CardHeader>
          <CardTitle>Auction Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center">
              <MapPin className="h-5 w-5 text-gray-400 mr-3" />
              <div>
                <div className="text-sm text-gray-600">Auctioneer</div>
                <div className="font-medium">
                  {auction.auctioneers?.company_name || 'Community Auction House'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Starts</div>
                  <div className="font-medium">{formatDate(auction.starts_at)}</div>
                </div>
              </div>

              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <div className="text-sm text-gray-600">Ends</div>
                  <div className="font-medium">{formatDate(auction.ends_at)}</div>
                </div>
              </div>
            </div>

            {auction.anti_sniping_seconds > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>Anti-Sniping:</strong> Auction will extend by {auction.anti_sniping_seconds} seconds
                  if a bid is placed near the end time.
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
