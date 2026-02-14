'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimeRemaining, formatDate } from '@/lib/utils'
import { Clock, MapPin, ArrowLeft, Calendar } from 'lucide-react'

interface AuctionHeaderProps {
  auction: any
}

export function AuctionHeader({ auction }: AuctionHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState('')

  useEffect(() => {
    const updateTime = () => {
      setTimeRemaining(formatTimeRemaining(auction.ends_at))
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [auction.ends_at])

  const getStatusInfo = () => {
    const now = new Date()
    const startsAt = new Date(auction.starts_at)
    const endsAt = new Date(auction.ends_at)

    if (now < startsAt) {
      return {
        badge: <Badge variant="outline">Starting Soon</Badge>,
        text: `Starts ${formatDate(auction.starts_at)}`,
        color: 'text-blue-600'
      }
    }

    if (now >= startsAt && now <= endsAt) {
      const hoursLeft = (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      if (hoursLeft <= 24) {
        return {
          badge: <Badge variant="destructive">Ending Soon</Badge>,
          text: `Ends in ${timeRemaining}`,
          color: 'text-red-600 font-medium'
        }
      }
      return {
        badge: <Badge variant="default" className="bg-green-600">Live Auction</Badge>,
        text: `Ends in ${timeRemaining}`,
        color: 'text-green-600 font-medium'
      }
    }

    return {
      badge: <Badge variant="secondary">Ended</Badge>,
      text: `Ended ${formatDate(auction.ends_at)}`,
      color: 'text-gray-600'
    }
  }

  const status = getStatusInfo()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Back button */}
      <div className="mb-4">
        <Button variant="outline" asChild>
          <Link href="/auctions">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Auctions
          </Link>
        </Button>
      </div>

      {/* Header content */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1">
          {/* Title and status */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {auction.title}
            </h1>
            {status.badge}
          </div>

          {/* Auctioneer */}
          <div className="flex items-center text-gray-600 mb-3">
            <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>
              Hosted by{' '}
              {auction.auctioneers?.slug ? (
                <Link
                  href={`/auctioneers/${auction.auctioneers.slug}`}
                  className="font-medium text-blue-600 hover:text-blue-800"
                >
                  {auction.auctioneers.company_name}
                </Link>
              ) : (
                <span className="font-medium">
                  {auction.auctioneers?.company_name}
                </span>
              )}
            </span>
          </div>

          {/* Description */}
          <p className="text-gray-700 leading-relaxed">
            {auction.description}
          </p>
        </div>

        {/* Timing info */}
        <div className="lg:w-64 bg-gray-50 rounded-lg p-4">
          <div className="text-center">
            <Clock className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <div className={`text-lg font-semibold ${status.color}`}>
              {status.text}
            </div>

            {/* Additional timing details */}
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>Started:</span>
                <span>{formatDate(auction.starts_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Ends:</span>
                <span>{formatDate(auction.ends_at)}</span>
              </div>
              {auction.anti_sniping_seconds > 0 && (
                <div className="mt-3 p-2 bg-blue-50 rounded text-blue-800 text-xs">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Anti-sniping: +{auction.anti_sniping_seconds}s on late bids
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}