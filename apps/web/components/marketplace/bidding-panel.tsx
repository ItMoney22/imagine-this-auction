'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { formatCurrency, formatTimeRemaining } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  Clock,
  Gavel,
  Wallet,
  Star,
  StarOff,
  TrendingUp,
  AlertTriangle,
  Mail,
  RefreshCw
} from 'lucide-react'

interface BiddingPanelProps {
  lot: any
  auction: any
  user: any
  walletBalance: number
  bids: any[]
  auctionEndTime: string
  onBidPlaced: (bid: any) => void
}

export function BiddingPanel({
  lot,
  auction,
  user,
  walletBalance,
  bids,
  auctionEndTime,
  onBidPlaced,
}: BiddingPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { toast } = useToast()

  const [timeRemaining, setTimeRemaining] = useState('')
  const [currentHigh, setCurrentHigh] = useState(0)
  const [maxBidAmount, setMaxBidAmount] = useState('')
  const [isWatching, setIsWatching] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate current high bid - use lot.current_high_bid as source of truth
  useEffect(() => {
    const highFromBids = bids.length > 0
      ? Math.max(...bids.map(bid => bid.amount))
      : 0
    // Use the higher of: lot's current_high_bid, calculated from bids, or starting_bid
    const highBid = Math.max(
      lot.current_high_bid || 0,
      highFromBids,
      lot.starting_bid
    )
    setCurrentHigh(highBid)
  }, [bids, lot.starting_bid, lot.current_high_bid])

  // Quick-bid deeplink: when arriving from outbid notification with ?quickbid=1,
  // scroll the Quick Bid button into view and toast a hint.
  useEffect(() => {
    if (searchParams?.get('quickbid') !== '1') return
    if (!user) return
    const t = setTimeout(() => {
      const el = document.getElementById('quick-bid-button')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-4', 'ring-amber-300', 'ring-offset-2')
        setTimeout(() => el.classList.remove('ring-4', 'ring-amber-300', 'ring-offset-2'), 2500)
      }
      toast({
        title: 'You were outbid',
        description: `Tap "Bid ${formatCurrency(currentHigh + lot.increment)}" to retake the lead.`,
      })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id, currentHigh])

  // Timer updates
  useEffect(() => {
    const updateTimer = () => {
      setTimeRemaining(formatTimeRemaining(new Date(auctionEndTime)))
    }

    updateTimer()
    timerRef.current = setInterval(updateTimer, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [auctionEndTime])

  const getNextBidAmount = () => {
    return currentHigh + lot.increment
  }

  const isAuctionLive = () => {
    const now = new Date()
    const startTime = new Date(auction.starts_at)
    const endTime = new Date(auctionEndTime)
    return now >= startTime && now <= endTime
  }

  const isUserHighBidder = () => {
    return user && bids.length > 0 && bids[0].bidder_id === user.id
  }

  const canBid = () => {
    if (!user) return false
    if (!isAuctionLive()) return false
    if (walletBalance < getNextBidAmount()) return false
    if (isUserHighBidder()) return false
    return true
  }

  const handleBid = async (amount: number) => {
    if (!user || !canBid()) return

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('place_bid', {
        p_lot_id: lot.id,
        p_user_id: user.id,
        p_amount: amount
      })

      if (error) throw error

      // Check if the RPC returned an error in its response
      if (data && !data.success) {
        throw new Error(data.error || 'Bid failed')
      }

      // Manually add the new bid to local state (fallback if realtime doesn't work)
      const newBid = {
        id: data.bid_id,
        lot_id: lot.id,
        bidder_id: user.id,
        amount: amount,
        created_at: new Date().toISOString(),
        users: {
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email
        }
      }
      onBidPlaced(newBid)

      // Show success toast
      toast({
        title: "Bid Placed!",
        description: `You are now the high bidder at ${formatCurrency(amount)}`,
        variant: "default"
      })

      // Clear bid input
      setMaxBidAmount('')

    } catch (error) {
      toast({
        title: "Bid Failed",
        description: error instanceof Error ? error.message : "Could not place bid",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleQuickBid = () => {
    handleBid(getNextBidAmount())
  }

  const handleMaxBid = async () => {
    const amount = parseInt(maxBidAmount)
    if (!user || amount < getNextBidAmount() || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/lots/${lot.id}/max-bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_amount: amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to set max bid')
      toast({
        title: 'Max bid set',
        description: `We'll auto-bid up to ${formatCurrency(amount)} to keep you on top.`,
      })
      setMaxBidAmount('')
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleWatchlistToggle = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    // Toggle watchlist status
    setIsWatching(!isWatching)
    toast({
      title: isWatching ? "Removed from Watchlist" : "Added to Watchlist",
      description: isWatching ? "You'll no longer receive updates" : "You'll receive email notifications",
      variant: "default"
    })
  }

  // Mobile sticky bar component
  const StickyBidBar = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-600">Current High</div>
          <div className="font-semibold text-green-600">
            {formatCurrency(currentHigh)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-600">Next Bid</div>
          <div className="font-semibold text-blue-600">
            {formatCurrency(getNextBidAmount())}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-600">Balance</div>
          <div className="font-semibold">
            {formatCurrency(walletBalance)}
          </div>
        </div>

        <Button
          onClick={handleQuickBid}
          disabled={!canBid() || loading}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          aria-label={`Place bid for ${formatCurrency(getNextBidAmount())}`}
        >
          <Gavel className="h-4 w-4 mr-1" />
          Bid
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop/Tablet Bidding Panel */}
      <div className="space-y-4">
        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Auction Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Timer */}
            <div
              className="text-center p-4 bg-gray-50 rounded-lg"
              aria-live="polite"
              aria-label="Auction time remaining"
            >
              <div className="text-2xl font-bold text-gray-900">
                {timeRemaining}
              </div>
              <div className="text-sm text-gray-600">
                {isAuctionLive() ? 'Time Remaining' : 'Auction Ended'}
              </div>
            </div>

            {/* Current High Bid */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Current High Bid:</span>
              <span
                className="text-xl font-bold text-green-600"
                aria-live="polite"
                aria-label={`Current high bid ${formatCurrency(currentHigh)}`}
              >
                {formatCurrency(currentHigh)}
              </span>
            </div>

            {/* Next Bid Amount */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Next Bid:</span>
              <span className="text-lg font-semibold text-blue-600">
                {formatCurrency(getNextBidAmount())}
              </span>
            </div>

            {/* User Status */}
            {user && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Your Status:</span>
                <Badge variant={isUserHighBidder() ? "default" : "secondary"}>
                  {isUserHighBidder() ? "High Bidder" : "Not High Bidder"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bidding Controls */}
        {user ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Gavel className="h-5 w-5 mr-2" />
                Place Bid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Wallet Balance */}
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <Wallet className="h-4 w-4 mr-2 text-blue-600" />
                  <span className="text-sm text-blue-800">Your Balance:</span>
                </div>
                <span className="font-semibold text-blue-800">
                  {formatCurrency(walletBalance)}
                </span>
              </div>

              {/* Quick Bid */}
              <div className="space-y-2">
                <Label>Quick Bid (Next Increment)</Label>
                <Button
                  id="quick-bid-button"
                  onClick={handleQuickBid}
                  disabled={!canBid() || loading}
                  className="w-full transition-all"
                  size="lg"
                  aria-describedby="bid-amount-help"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Gavel className="h-4 w-4 mr-2" />
                  )}
                  Bid {formatCurrency(getNextBidAmount())}
                </Button>
                <p id="bid-amount-help" className="text-xs text-gray-600">
                  Places a bid at the next increment amount
                </p>
              </div>

              {/* Max Bid */}
              <div className="space-y-2">
                <Label htmlFor="max-bid">Max Bid (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="max-bid"
                    type="number"
                    placeholder={`Min: ${getNextBidAmount()}`}
                    value={maxBidAmount}
                    onChange={(e) => setMaxBidAmount(e.target.value)}
                    min={getNextBidAmount()}
                    disabled={!canBid()}
                    aria-describedby="max-bid-help"
                  />
                  <Button
                    onClick={handleMaxBid}
                    disabled={!canBid() || !maxBidAmount || parseInt(maxBidAmount) < getNextBidAmount()}
                    variant="outline"
                  >
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Bid
                  </Button>
                </div>
                <p id="max-bid-help" className="text-xs text-gray-600">
                  System will bid incrementally up to your maximum
                </p>
              </div>

              {/* Guard Rails */}
              {!isAuctionLive() && (
                <div className="flex items-center p-3 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                  <span className="text-sm text-red-800">
                    {new Date() < new Date(auction.starts_at)
                      ? 'Auction has not started yet'
                      : 'Auction has ended'
                    }
                  </span>
                </div>
              )}

              {user && walletBalance < getNextBidAmount() && (
                <div className="space-y-2">
                  <div className="flex items-center p-3 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="h-4 w-4 mr-2 text-yellow-600" />
                    <span className="text-sm text-yellow-800">
                      Need {formatCurrency(getNextBidAmount() - walletBalance)} more credits to bid
                    </span>
                  </div>
                  <Button
                    onClick={() => router.push('/wallet')}
                    variant="outline"
                    className="w-full bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Add Credits to Wallet
                  </Button>
                </div>
              )}

              {isUserHighBidder() && (
                <div className="flex items-center p-3 bg-green-50 rounded-lg">
                  <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                  <span className="text-sm text-green-800">
                    You are currently the high bidder
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="text-center py-6">
              <p className="text-gray-600 mb-4">Sign in to place bids</p>
              <Button onClick={() => router.push('/login')}>
                Sign In to Bid
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Watchlist & Notifications */}
        {user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Star className="h-5 w-5 mr-2" />
                Watchlist & Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {isWatching ? (
                    <Star className="h-4 w-4 mr-2 text-yellow-500 fill-current" />
                  ) : (
                    <StarOff className="h-4 w-4 mr-2 text-gray-400" />
                  )}
                  <Label htmlFor="watchlist">Add to Watchlist</Label>
                </div>
                <Switch
                  id="watchlist"
                  checked={isWatching}
                  onCheckedChange={handleWatchlistToggle}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-gray-400" />
                  <Label htmlFor="email-notifications">Ending Soon Alerts</Label>
                </div>
                <Switch
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                  disabled={!isWatching}
                />
              </div>

              <p className="text-xs text-gray-600">
                Get notified when this lot is ending soon or when you're outbid
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile Sticky Bar */}
      {user && <StickyBidBar />}

      {/* Mobile spacing to prevent content from being hidden behind sticky bar */}
      <div className="h-20 md:hidden" />
    </>
  )
}
