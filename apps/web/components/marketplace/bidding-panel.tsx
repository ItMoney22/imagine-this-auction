'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { PremiumDisclosure } from '@/components/marketplace/premium-disclosure'
import { WorkingBar } from '@/components/payments/working-bar'
import { formatTimeRemaining } from '@/lib/utils'
import { formatUsd, premiumPercentForAuction } from '@/lib/pricing/premium'
import { canPlaceBid, parseBidDollars } from '@/lib/payments/bid-gate'
import type { PaymentMethodPublic } from '@/lib/payments/methods'
import { useToast } from '@/hooks/use-toast'
import {
  Clock,
  CreditCard,
  Gavel,
  Star,
  StarOff,
  TrendingUp,
  AlertTriangle,
  Mail,
} from 'lucide-react'

/** The lot fields the panel reads. app/lots/[id]/page.tsx passes the whole row. */
interface PanelLot {
  id: string
  /** Cents. */
  increment: number
  /** Cents. */
  starting_bid: number
  /** Cents; null until the first bid. */
  current_high_bid?: number | null
}

interface PanelAuction {
  starts_at: string
  buyer_premium_percent?: number | string | null
}

interface PanelUser {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

interface PanelBid {
  id: string
  lot_id?: string
  bidder_id: string
  /** Cents. */
  amount: number
  created_at?: string
  users?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null
}

interface BiddingPanelProps {
  lot: PanelLot
  auction: PanelAuction
  user: PanelUser | null | undefined
  bids: PanelBid[]
  auctionEndTime: string
  onBidPlaced: (bid: PanelBid) => void
}

/** Whether the bidder's card on file has been looked up yet. */
type CardStatus = 'idle' | 'loading' | 'ready' | 'error'

export function BiddingPanel({
  lot,
  auction,
  user,
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
  const [maxBidInput, setMaxBidInput] = useState('')
  const [isWatching, setIsWatching] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodPublic | null>(null)
  const [cardStatus, setCardStatus] = useState<CardStatus>('idle')
  const [cardRefresh, setCardRefresh] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const lotPath = `/lots/${lot.id}`
  const addCardHref = `/account/payment?next=${encodeURIComponent(lotPath)}`
  const signInHref = `/login?redirectedFrom=${encodeURIComponent(lotPath)}`

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

  // Card on file: fetched once per signed-in user, and again whenever the tab
  // regains focus (the bidder may have just saved a card in another tab).
  useEffect(() => {
    if (!user) {
      setPaymentMethod(null)
      setCardStatus('idle')
      return
    }
    let cancelled = false
    setCardStatus('loading')
    fetch('/api/payments/methods', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) {
          setPaymentMethod(null)
          setCardStatus('ready')
          return
        }
        if (!res.ok) throw new Error(`payment method lookup failed: ${res.status}`)
        setPaymentMethod((await res.json()) as PaymentMethodPublic)
        setCardStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setCardStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, cardRefresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    const onFocus = () => setCardRefresh((n) => n + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user])

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
        description: `Tap "Bid ${formatUsd(currentHigh + lot.increment)}" to retake the lead.`,
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
    return Boolean(user && bids.length > 0 && bids[0].bidder_id === user.id)
  }

  const hasVerifiedCard = paymentMethod?.verified === true

  const gate = canPlaceBid({
    user,
    auctionLive: isAuctionLive(),
    hasVerifiedCard,
    isHighBidder: isUserHighBidder(),
  })

  const canBid = () => gate.ok

  const nextBid = getNextBidAmount()
  const premiumPct = premiumPercentForAuction(auction)
  const maxBidCents = parseBidDollars(maxBidInput)
  const maxBidValid = maxBidCents !== null && maxBidCents >= nextBid

  const retryCardLookup = useCallback(() => setCardRefresh((n) => n + 1), [])

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
      const newBid: PanelBid = {
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
        description: `You are now the high bidder at ${formatUsd(amount)}`,
        variant: "default"
      })

      // Clear bid input
      setMaxBidInput('')

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
    // Typed in dollars, sent in integer cents.
    const amount = parseBidDollars(maxBidInput)
    if (!user || !canBid() || amount === null || amount < getNextBidAmount() || loading) return
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
        description: `We'll auto-bid up to ${formatUsd(amount)} to keep you on top.`,
      })
      setMaxBidInput('')
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to set max bid',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleWatchlistToggle = async () => {
    if (!user) {
      router.push(signInHref)
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

  /** What stands between this bidder and the bid button, if anything. */
  const cardNotice = (() => {
    if (!user || gate.ok || gate.reason !== 'no_card') return null
    if (cardStatus === 'loading' || cardStatus === 'idle') {
      return <WorkingBar label="Checking your card on file…" />
    }
    if (cardStatus === 'error') {
      return (
        <div className="space-y-2 rounded-lg bg-yellow-50 p-3">
          <div className="flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2 text-yellow-600" aria-hidden="true" />
            <span className="text-sm text-yellow-800">Could not check your card on file.</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={retryCardLookup}>
            Try again
          </Button>
        </div>
      )
    }
    const unverified = paymentMethod !== null && !paymentMethod.verified
    return (
      <div className="space-y-2">
        <div className="flex items-start rounded-lg bg-yellow-50 p-3">
          <CreditCard className="h-4 w-4 mr-2 mt-0.5 text-yellow-700 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm text-yellow-900">
            {unverified
              ? 'Your card on file could not be verified. Replace it to bid.'
              : 'Add a card to bid. Nothing is charged unless you win.'}
          </span>
        </div>
        <Button asChild variant="outline" className="w-full bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700">
          <Link href={addCardHref}>
            <CreditCard className="h-4 w-4 mr-2" aria-hidden="true" />
            {unverified ? 'Replace your card' : 'Add a card to bid'}
          </Link>
        </Button>
      </div>
    )
  })()

  const showAddCardInStickyBar =
    Boolean(user) && !gate.ok && gate.reason === 'no_card' && cardStatus === 'ready'

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
                className="text-xl font-bold text-green-600 tabular-nums"
                aria-live="polite"
                aria-label={`Current high bid ${formatUsd(currentHigh)}`}
              >
                {formatUsd(currentHigh)}
              </span>
            </div>

            {/* Next Bid Amount */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Next Bid:</span>
              <span className="text-lg font-semibold text-blue-600 tabular-nums">
                {formatUsd(nextBid)}
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
              {/* Card on file */}
              {hasVerifiedCard && paymentMethod && (
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center">
                    <CreditCard className="h-4 w-4 mr-2 text-blue-600" aria-hidden="true" />
                    <span className="text-sm text-blue-800">Card on file:</span>
                  </div>
                  <span className="text-sm font-semibold text-blue-800">
                    {paymentMethod.brand ? paymentMethod.brand.toUpperCase() : 'Card'} •••• {paymentMethod.last4 ?? '••••'}
                  </span>
                </div>
              )}

              {/* Quick Bid */}
              <div className="space-y-2">
                <Label>Quick Bid (Next Increment)</Label>
                <Button
                  id="quick-bid-button"
                  onClick={handleQuickBid}
                  disabled={!canBid() || loading}
                  className="w-full transition-all tabular-nums"
                  size="lg"
                  aria-describedby="bid-amount-help"
                >
                  <Gavel className="h-4 w-4 mr-2" aria-hidden="true" />
                  Bid {formatUsd(nextBid)}
                </Button>
                {loading && <WorkingBar label="Placing your bid…" />}
                {premiumPct !== null && (
                  <PremiumDisclosure hammerCents={nextBid} premiumPct={premiumPct} bidLabel="your bid" />
                )}
                <p id="bid-amount-help" className="text-xs text-gray-600">
                  Places a bid at the next increment amount
                </p>
              </div>

              {/* Max Bid */}
              <div className="space-y-2">
                <Label htmlFor="max-bid">Max Bid (Optional)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span
                      className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500"
                      aria-hidden="true"
                    >
                      $
                    </span>
                    <Input
                      id="max-bid"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      className="pl-7 tabular-nums"
                      placeholder={`Min ${formatUsd(nextBid)}`}
                      value={maxBidInput}
                      onChange={(e) => setMaxBidInput(e.target.value)}
                      disabled={!canBid()}
                      aria-describedby="max-bid-help"
                      aria-invalid={maxBidInput.length > 0 && !maxBidValid ? true : undefined}
                    />
                  </div>
                  <Button
                    onClick={handleMaxBid}
                    disabled={!canBid() || loading || !maxBidValid}
                    variant="outline"
                  >
                    <TrendingUp className="h-4 w-4 mr-1" aria-hidden="true" />
                    Bid
                  </Button>
                </div>
                <p id="max-bid-help" className="text-xs text-gray-600">
                  {maxBidInput.length > 0 && !maxBidValid
                    ? `Enter a dollar amount of at least ${formatUsd(nextBid)}`
                    : 'System will bid incrementally up to your maximum'}
                </p>
              </div>

              {/* Guard Rails */}
              {!isAuctionLive() && (
                <div className="flex items-center p-3 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 mr-2 text-red-600" aria-hidden="true" />
                  <span className="text-sm text-red-800">
                    {new Date() < new Date(auction.starts_at)
                      ? 'Auction has not started yet'
                      : 'Auction has ended'
                    }
                  </span>
                </div>
              )}

              {cardNotice}

              {isUserHighBidder() && (
                <div className="flex items-center p-3 bg-green-50 rounded-lg">
                  <TrendingUp className="h-4 w-4 mr-2 text-green-600" aria-hidden="true" />
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
              <Button onClick={() => router.push(signInHref)}>
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
                Get notified when this lot is ending soon or when you&apos;re outbid
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile Sticky Bar */}
      {user && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-600">Current High</div>
              <div className="font-semibold text-green-600 tabular-nums">
                {formatUsd(currentHigh)}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-600">Next Bid</div>
              <div className="font-semibold text-blue-600 tabular-nums">
                {formatUsd(nextBid)}
              </div>
            </div>

            {showAddCardInStickyBar ? (
              <Button asChild size="sm" variant="outline" className="border-indigo-200 text-indigo-700">
                <Link href={addCardHref}>
                  <CreditCard className="h-4 w-4 mr-1" aria-hidden="true" />
                  Add a card
                </Link>
              </Button>
            ) : (
              <Button
                onClick={handleQuickBid}
                disabled={!canBid() || loading}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 tabular-nums"
                aria-label={`Place bid for ${formatUsd(nextBid)}`}
              >
                <Gavel className="h-4 w-4 mr-1" aria-hidden="true" />
                Bid {formatUsd(nextBid)}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Mobile spacing to prevent content from being hidden behind sticky bar */}
      <div className="h-20 md:hidden" />
    </>
  )
}
