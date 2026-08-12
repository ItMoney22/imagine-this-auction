'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimeRemaining } from '@/lib/utils'
import { Clock, Package, Eye, MapPin } from 'lucide-react'

interface AuctionCardProps {
  auction: any // Full auction data with relations
}

export function AuctionCard({ auction }: AuctionCardProps) {
  const [timeRemaining, setTimeRemaining] = useState('')

  useEffect(() => {
    const updateTime = () => {
      setTimeRemaining(formatTimeRemaining(auction.ends_at))
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [auction.ends_at])

  const getStatusBadge = () => {
    const now = new Date()
    const startsAt = new Date(auction.starts_at)
    const endsAt = new Date(auction.ends_at)

    if (now < startsAt) {
      return <Badge variant="outline">Starting Soon</Badge>
    }

    if (now >= startsAt && now <= endsAt) {
      const hoursLeft = (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      if (hoursLeft <= 24) {
        return <Badge variant="destructive">Ending Soon</Badge>
      }
      return <Badge variant="default" className="bg-green-600">Live</Badge>
    }

    return <Badge variant="secondary">Ended</Badge>
  }

  const isLive = () => {
    const now = new Date()
    const startsAt = new Date(auction.starts_at)
    const endsAt = new Date(auction.ends_at)
    return now >= startsAt && now <= endsAt
  }

  const lotCount = auction.lots?.[0]?.count || 0

  return (
    <Card className="hover:shadow-lg transition-all duration-200 group">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
              {auction.title}
            </h3>
            <div className="flex items-center text-sm text-gray-600 mt-1">
              <MapPin className="h-3 w-3 mr-1" />
              {auction.auctioneers?.company_name}
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        <p className="text-sm text-gray-600 line-clamp-2">
          {auction.description}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center text-sm text-gray-600">
            <Package className="h-4 w-4 mr-2" />
            <span>
              {lotCount} lot{lotCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center text-sm text-gray-600">
            <Clock className="h-4 w-4 mr-2" />
            <span className={isLive() ? 'font-medium text-red-600' : ''}>
              {timeRemaining}
            </span>
          </div>
        </div>

        {/* Anti-sniping info */}
        {auction.anti_sniping_seconds > 0 && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
            Anti-sniping: +{auction.anti_sniping_seconds}s on late bids
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button asChild className="flex-1">
            <Link href={`/auctions/${auction.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              View Lots
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}