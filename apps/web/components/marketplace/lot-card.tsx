'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Eye, Star, Package } from 'lucide-react'

interface LotCardProps {
  lot: any
  auction: any
  onImageError: () => void
  hasImageError: boolean
}

export function LotCard({ lot, auction, onImageError, hasImageError }: LotCardProps) {
  const getCurrentHighBid = () => {
    if (!lot.bids || lot.bids.length === 0) {
      return lot.start_price_itc
    }

    return Math.max(...lot.bids.map((bid: any) => bid.amount_itc))
  }

  const getBidCount = () => {
    return lot.bids?.length || 0
  }

  const getNextBidAmount = () => {
    return getCurrentHighBid() + lot.bid_increment_itc
  }

  const isReserveMet = () => {
    if (!lot.reserve_price_itc) return true
    return getCurrentHighBid() >= lot.reserve_price_itc
  }

  const isLive = () => {
    const now = new Date()
    const startsAt = new Date(auction.starts_at)
    const endsAt = new Date(auction.ends_at)
    return now >= startsAt && now <= endsAt
  }

  const primaryImage = lot.images?.[0]
  const hasValidImage = primaryImage && !hasImageError

  return (
    <Card className="hover:shadow-lg transition-all duration-200 group">
      <CardHeader className="pb-3">
        {/* Lot number and category */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Lot #{lot.lot_number}
            </Badge>
            {lot.category && (
              <Badge variant="secondary" className="text-xs">
                {lot.category}
              </Badge>
            )}
          </div>

          {/* Reserve indicator */}
          {lot.reserve_price_itc && (
            <Badge variant={isReserveMet() ? "default" : "destructive"} className="text-xs">
              {isReserveMet() ? "Reserve Met" : "Reserve"}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {lot.title}
        </h3>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Image */}
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
          {hasValidImage ? (
            <img
              src={primaryImage}
              alt={lot.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={onImageError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          )}

          {/* Image count indicator */}
          {lot.images && lot.images.length > 1 && (
            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
              +{lot.images.length - 1}
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 line-clamp-2">
          {lot.description}
        </p>

        {/* Pricing */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Current High:</span>
            <span className="font-semibold text-lg text-green-600">
              {formatCurrency(getCurrentHighBid())}
            </span>
          </div>

          {isLive() && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Next Bid:</span>
              <span className="font-medium text-blue-600">
                {formatCurrency(getNextBidAmount())}
              </span>
            </div>
          )}

          {lot.reserve_price_itc && !isReserveMet() && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-red-600">Reserve:</span>
              <span className="font-medium text-red-600">
                {formatCurrency(lot.reserve_price_itc)}
              </span>
            </div>
          )}
        </div>

        {/* Bidding stats */}
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>{getBidCount()} bid{getBidCount() !== 1 ? 's' : ''}</span>
          <span>Increment: {formatCurrency(lot.bid_increment_itc)}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button asChild className="flex-1">
            <Link href={`/lots/${lot.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              View & Bid
            </Link>
          </Button>

          {/* Watchlist button - placeholder for future implementation */}
          <Button variant="outline" size="icon" className="flex-shrink-0">
            <Star className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}