'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { History, TrendingUp, User, Crown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface BidHistoryProps {
  lot: any
  bids: any[]
  currentUser: any
}

export function BidHistory({ lot, bids: initialBids, currentUser }: BidHistoryProps) {
  const [bids, setBids] = useState(initialBids)
  const [visibleCount, setVisibleCount] = useState(10)
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevBidsLength = useRef(bids.length)

  // Real-time subscription for new bids
  useEffect(() => {
    const channel = supabase
      .channel(`lot_${lot.id}_bids_history`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `lot_id=eq.${lot.id}`
        },
        async (payload) => {
          const newBid = payload.new

          // Fetch user info for the new bid
          const { data: bidUser } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', newBid.bidder_id)
            .single()

          const bidWithUser = {
            ...newBid,
            users: bidUser
          }

          setBids(prev => [bidWithUser, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [lot.id, supabase])

  // Auto-scroll to top when new bids arrive
  useEffect(() => {
    if (bids.length > prevBidsLength.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
    prevBidsLength.current = bids.length
  }, [bids.length])

  const getDisplayName = (bid: any) => {
    if (!bid.users) return 'Anonymous'

    const firstName = bid.users.first_name
    const lastName = bid.users.last_name

    if (firstName && lastName) {
      return `${firstName} ${lastName.charAt(0)}.`
    } else if (firstName) {
      return firstName
    } else if (bid.users.email) {
      return bid.users.email.split('@')[0]
    }

    return 'Anonymous'
  }

  const isCurrentUserBid = (bid: any) => {
    return currentUser && bid.bidder_id === currentUser.id
  }

  const visibleBids = bids.slice(0, visibleCount)
  const hasMoreBids = bids.length > visibleCount

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <History className="h-5 w-5 mr-2" />
            Bid History
          </div>
          <Badge variant="secondary">
            {bids.length} bid{bids.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bids.length > 0 ? (
          <div className="space-y-4">
            {/* Bid ladder */}
            <div
              ref={scrollRef}
              className="max-h-96 overflow-y-auto space-y-2"
              aria-label="Bid history list"
              role="log"
              aria-live="polite"
            >
              {visibleBids.map((bid, index) => {
                const isHighBid = index === 0
                const isUserBid = isCurrentUserBid(bid)
                const timeAgo = new Date(bid.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })

                return (
                  <div
                    key={bid.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isHighBid
                        ? 'bg-green-50 border-green-200'
                        : isUserBid
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                    role="listitem"
                  >
                    <div className="flex items-center space-x-3">
                      {/* Position indicator */}
                      <div className="flex items-center">
                        {isHighBid ? (
                          <Crown className="h-4 w-4 text-green-600" />
                        ) : (
                          <span className="text-sm text-gray-500 w-4 text-center">
                            #{index + 1}
                          </span>
                        )}
                      </div>

                      {/* Bidder info */}
                      <div className="flex items-center space-x-2">
                        <User className="h-3 w-3 text-gray-400" />
                        <span
                          className={`text-sm font-medium ${
                            isUserBid ? 'text-blue-700' : 'text-gray-700'
                          }`}
                        >
                          {isUserBid ? 'You' : getDisplayName(bid)}
                        </span>
                      </div>
                    </div>

                    {/* Bid amount and time */}
                    <div className="text-right">
                      <div
                        className={`font-semibold ${
                          isHighBid
                            ? 'text-green-700'
                            : isUserBid
                            ? 'text-blue-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {formatCurrency(bid.amount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {timeAgo}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Load more button */}
            {hasMoreBids && (
              <button
                onClick={() => setVisibleCount(prev => prev + 10)}
                className="w-full text-sm text-blue-600 hover:text-blue-800 py-2"
              >
                Show {Math.min(10, bids.length - visibleCount)} more bids
              </button>
            )}

            {/* Bid statistics */}
            <div className="pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Starting Price:</span>
                  <span className="font-medium">
                    {formatCurrency(lot.starting_bid)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Bid Increment:</span>
                  <span className="font-medium">
                    {formatCurrency(lot.increment)}
                  </span>
                </div>
              </div>

              {bids.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-600">Price Increase:</span>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="h-3 w-3 text-green-600" />
                    <span className="font-medium text-green-600">
                      +{formatCurrency(bids[0].amount - lot.starting_bid)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-8">
            <History className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No bids yet
            </h3>
            <p className="text-gray-600">
              Be the first to place a bid on this lot
            </p>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-800">
                Starting at {formatCurrency(lot.starting_bid)}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}