'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { DEMO } from '@/config/demo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Clock, Flame, Users, Gavel } from 'lucide-react'
import { cn } from '@/lib/utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface TimerUpdate {
  type: string
  lot_id: string
  seconds_left: number
  current_bid_itc: number
  timestamp: string
}

interface AntiSnipeEvent {
  type: string
  lot_id: string
  extension_seconds: number
  new_end_time: string
  message: string
  timestamp: string
}

interface LotData {
  id: string
  lot_number: number
  title: string
  start_price_itc: number
  current_bid_itc?: number
  estimate_low_itc?: number
  estimate_high_itc?: number
  images?: string[]
  category?: string
  brand?: string
}

interface AuctionTimerProps {
  lot: LotData
  className?: string
}

export function AuctionTimer({ lot, className }: AuctionTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [currentBid, setCurrentBid] = useState<number>(lot.current_bid_itc || lot.start_price_itc)
  const [isExtended, setIsExtended] = useState(false)
  const [extensionMessage, setExtensionMessage] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!DEMO.ENABLED) return

    const channelName = `${DEMO.REALTIME_CHANNEL_PREFIX}${lot.id}`
    const channel = supabase.channel(channelName)

    // Listen for timer updates
    channel.on('broadcast', { event: 'timer_update' }, (payload) => {
      const update = payload.payload as TimerUpdate
      setTimeLeft(update.seconds_left)
      setCurrentBid(update.current_bid_itc)
    })

    // Listen for anti-snipe events
    channel.on('broadcast', { event: 'anti_snipe' }, (payload) => {
      const event = payload.payload as AntiSnipeEvent
      setIsExtended(true)
      setExtensionMessage(event.message)

      // Clear extension message after 5 seconds
      setTimeout(() => {
        setIsExtended(false)
        setExtensionMessage('')
      }, 5000)
    })

    // Listen for lot end
    channel.on('broadcast', { event: 'lot_ended' }, () => {
      setTimeLeft(0)
    })

    // Subscribe and track connection
    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED')
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [lot.id])

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return '00:00'

    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getTimerColor = (seconds: number): string => {
    if (seconds <= 30) return 'text-red-500'
    if (seconds <= 60) return 'text-orange-500'
    if (seconds <= 180) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getProgressValue = (seconds: number): number => {
    const maxTime = DEMO.LOT_DURATION_SEC
    return Math.max(0, (seconds / maxTime) * 100)
  }

  const bidIncrease = currentBid > lot.start_price_itc ? currentBid - lot.start_price_itc : 0
  const bidIncreasePercent = lot.start_price_itc > 0 ? (bidIncrease / lot.start_price_itc) * 100 : 0

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      {/* Anti-snipe notification */}
      {isExtended && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-orange-500 text-white text-center py-2 text-sm font-medium animate-pulse">
          <Flame className="inline w-4 h-4 mr-1" />
          {extensionMessage}
        </div>
      )}

      <CardHeader className={cn('pb-3', isExtended && 'pt-12')}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Lot {lot.lot_number}: {lot.title}
          </CardTitle>
          <div className="flex items-center space-x-2">
            {/* Connection indicator */}
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />

            {/* Live badge */}
            <Badge variant={timeLeft > 0 ? 'default' : 'secondary'}>
              {timeLeft > 0 ? 'LIVE' : 'ENDED'}
            </Badge>
          </div>
        </div>

        {/* Category and brand */}
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          {lot.category && <span>{lot.category}</span>}
          {lot.brand && (
            <>
              <span>•</span>
              <span>{lot.brand}</span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Timer display */}
        <div className="text-center">
          <div className={cn(
            'text-4xl font-mono font-bold transition-colors',
            getTimerColor(timeLeft)
          )}>
            <Clock className="inline w-8 h-8 mr-2" />
            {formatTime(timeLeft)}
          </div>

          {/* Progress bar */}
          <Progress
            value={getProgressValue(timeLeft)}
            className="mt-2 h-2"
          />

          <p className="text-sm text-muted-foreground mt-1">
            Time remaining
          </p>
        </div>

        {/* Current bid */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center space-x-2">
            <Gavel className="w-5 h-5 text-primary" />
            <span className="font-medium">Current Bid</span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {currentBid.toLocaleString()} ITC
            </div>
            {bidIncrease > 0 && (
              <div className="text-sm text-green-600">
                +{bidIncrease.toLocaleString()} ITC (+{bidIncreasePercent.toFixed(1)}%)
              </div>
            )}
          </div>
        </div>

        {/* Estimates */}
        {(lot.estimate_low_itc || lot.estimate_high_itc) && (
          <div className="text-sm text-muted-foreground text-center">
            Estimate: {lot.estimate_low_itc?.toLocaleString()} - {lot.estimate_high_itc?.toLocaleString()} ITC
          </div>
        )}

        {/* Lot image */}
        {lot.images && lot.images[0] && (
          <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
            <img
              src={lot.images[0]}
              alt={lot.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Demo indicators */}
        {DEMO.ENABLED && (
          <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>Demo Mode - Bots Active</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AuctionTimer