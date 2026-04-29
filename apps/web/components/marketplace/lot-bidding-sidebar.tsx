'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'

import { BidHistory } from './bid-history'
import { BiddingPanel } from './bidding-panel'

interface Props {
  lot: any
  auction: any
  user: any
  walletBalance: number
  initialBids: any[]
}

export function LotBiddingSidebar({ lot, auction, user, walletBalance, initialBids }: Props) {
  const [supabase] = useState(() => createClient())
  const { toast } = useToast()
  const [bids, setBids] = useState(initialBids)
  const [auctionEndTime, setAuctionEndTime] = useState(auction.ends_at)

  useEffect(() => {
    const channel = supabase
      .channel(`lot_${lot.id}_bids_shared`)
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
          const { data: bidUser } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', newBid.bidder_id)
            .single()

          const bidWithUser: any = {
            ...newBid,
            users: bidUser,
          }

          setBids((prev) => {
            if (prev.some((bid) => bid.id === bidWithUser.id)) {
              return prev
            }

            const previousHighBidderId = prev[0]?.bidder_id

            if (user?.id === newBid.bidder_id) {
              toast({
                title: 'Bid Placed Successfully!',
                description: `You are now the high bidder at ${formatCurrency(newBid.amount)}`,
                variant: 'default'
              })
            } else if (previousHighBidderId === user?.id) {
              toast({
                title: "You've been outbid!",
                description: `New high bid: ${formatCurrency(newBid.amount)}`,
                variant: 'destructive'
              })
            }

            return [bidWithUser, ...prev]
          })

          const now = new Date()
          const endTime = new Date(auctionEndTime)
          const timeDiff = endTime.getTime() - now.getTime()
          const antiSnipingMs = auction.anti_sniping_seconds * 1000

          if (timeDiff > 0 && timeDiff <= antiSnipingMs) {
            const newEndTime = new Date(now.getTime() + antiSnipingMs).toISOString()
            setAuctionEndTime(newEndTime)

            toast({
              title: 'Auction Extended!',
              description: `Timer extended to ${new Date(newEndTime).toLocaleTimeString()}`,
              variant: 'default'
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [auction.anti_sniping_seconds, auctionEndTime, lot.id, supabase, toast, user?.id])

  const handleBidPlaced = (newBid: any) => {
    setBids((prev) => {
      if (prev.some((bid) => bid.id === newBid.id)) {
        return prev
      }

      return [newBid, ...prev]
    })
  }

  return (
    <div className="space-y-6">
      <BiddingPanel
        lot={lot}
        auction={auction}
        user={user}
        walletBalance={walletBalance}
        bids={bids}
        auctionEndTime={auctionEndTime}
        onBidPlaced={handleBidPlaced}
      />

      <BidHistory lot={lot} bids={bids} currentUser={user} />
    </div>
  )
}
