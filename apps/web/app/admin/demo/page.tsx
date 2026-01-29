'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { DEMO, DemoState } from '@/config/demo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Play,
  Square,
  RotateCcw,
  Activity,
  Users,
  Gavel,
  Clock,
  TrendingUp,
  AlertTriangle,
  Eye,
  Bot,
  Timer
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuctionTimer } from '@/components/demo/auction-timer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface DemoStats {
  auctions: number
  lots: number
  bots: number
  humans: number
  active_lots: number
  total_bids: number
  total_volume_itc: number
}

interface RecentBid {
  id: string
  amount_itc: number
  created_at: string
  user: {
    first_name: string
    metadata?: any
  }
  lot: {
    lot_number: number
    title: string
  }
}

interface ActiveLot {
  id: string
  lot_number: number
  title: string
  category: string
  brand?: string
  start_price_itc: number
  current_bid_itc?: number
  estimate_low_itc?: number
  estimate_high_itc?: number
  images?: string[]
  lot_ends_at: string
  status: string
}

export default function DemoAdminPage() {
  const [demoEnabled, setDemoEnabled] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [stats, setStats] = useState<DemoStats | null>(null)
  const [recentBids, setRecentBids] = useState<RecentBid[]>([])
  const [activeLots, setActiveLots] = useState<ActiveLot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Check demo mode after component mounts to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
    // Check environment variables directly on client side
    const nodeEnv = process.env.NODE_ENV
    const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE
    const isEnabled = nodeEnv !== 'production' && demoMode === 'true'
    console.log('Client-side demo check:', { nodeEnv, demoMode, isEnabled })
    setDemoEnabled(isEnabled)
  }, [])

  useEffect(() => {
    if (demoEnabled) {
      loadDemoData()
      const interval = setInterval(loadDemoData, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [demoEnabled])

  const loadDemoData = async () => {
    try {
      await Promise.all([
        loadStats(),
        loadRecentBids(),
        loadActiveLots()
      ])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo data')
    }
  }

  const loadStats = async () => {
    try {
      // Use our new summary API which works with existing schema
      const response = await fetch('/api/demo/summary')

      if (!response.ok) {
        throw new Error('Failed to load demo summary')
      }

      const summary = await response.json()

      if (summary.error) {
        throw new Error(summary.error)
      }

      setStats({
        auctions: summary.counts?.auctions || 0,
        lots: summary.counts?.lots || 0,
        bots: summary.counts?.bots || 0,
        humans: summary.counts?.humans || 0,
        active_lots: Math.min(summary.counts?.lots || 0, 3), // Show up to 3 lots as "active" for demo
        total_bids: summary.counts?.bids || 0,
        total_volume_itc: summary.financial?.total_volume_itc || 0
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
      // Fallback to showing some demo data
      setStats({
        auctions: 2,
        lots: 6,
        bots: 0,
        humans: 0,
        active_lots: 3,
        total_bids: 2,
        total_volume_itc: 82000
      })
    }
  }

  const loadRecentBids = async () => {
    try {
      // Get recent bids from existing data
      const { data, error } = await supabase
        .from('bids')
        .select(`
          id, amount, created_at, bidder_id,
          lots!inner(lot_number, title),
          users!inner(first_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Failed to load bids:', error)
        return
      }

      if (data) {
        setRecentBids(data.map(bid => ({
          id: bid.id,
          amount_itc: bid.amount || 0,
          created_at: bid.created_at,
          user: {
            first_name: bid.users?.first_name || 'Anonymous',
            metadata: bid.users?.email?.includes('bot') ? { is_bot: true } : null
          },
          lot: {
            lot_number: bid.lots?.lot_number || 0,
            title: bid.lots?.title || 'Unknown Lot'
          }
        })))
      }
    } catch (error) {
      console.error('Failed to load recent bids:', error)
      // Fallback to empty array
      setRecentBids([])
    }
  }

  const loadActiveLots = async () => {
    try {
      // Get existing lots and show them as "live" for demo purposes
      const { data, error } = await supabase
        .from('lots')
        .select(`
          id, lot_number, title, category,
          starting_bid, current_high_bid,
          estimate_low, estimate_high,
          images
        `)
        .order('lot_number', { ascending: true })
        .limit(3) // Show first 3 lots as "active"

      if (error) {
        console.error('Failed to load lots:', error)
        return
      }

      if (data) {
        // Transform data to match expected format and add demo timing
        const now = new Date()
        const demoLots = data.map((lot, index) => ({
          id: lot.id,
          lot_number: lot.lot_number,
          title: lot.title,
          category: lot.category || 'General',
          brand: '',
          start_price_itc: lot.starting_bid || 0,
          current_bid_itc: lot.current_high_bid || 0,
          estimate_low_itc: lot.estimate_low || 0,
          estimate_high_itc: lot.estimate_high || 0,
          images: lot.images || [],
          // Add demo timing - each lot "ends" in 5-7 minutes
          lot_ends_at: new Date(now.getTime() + (300 + index * 120) * 1000).toISOString(),
          status: 'live'
        }))

        setActiveLots(demoLots)
      }
    } catch (error) {
      console.error('Failed to load active lots:', error)
      // Fallback to empty array
      setActiveLots([])
    }
  }

  const handleDemoAction = async (action: 'start' | 'stop' | 'reset') => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/demo/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Demo action failed')
      }

      const result = await response.json()
      console.log('Demo action result:', result)

      // Refresh data after action
      setTimeout(loadDemoData, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo action failed')
    } finally {
      setLoading(false)
    }
  }

  // Show loading until component is mounted to prevent hydration issues
  if (!mounted) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (!demoEnabled) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Demo mode is not enabled. Set NEXT_PUBLIC_DEMO_MODE=true in your environment variables.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Demo Admin Console</h1>
          <p className="text-muted-foreground">Monitor and control live auction demonstrations</p>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'} className="text-lg px-4 py-1">
          {isRunning ? 'RUNNING' : 'STOPPED'}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <span>Demo Controls</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex space-x-4">
          <Button
            onClick={() => handleDemoAction('start')}
            disabled={loading || isRunning}
            className="flex items-center space-x-2"
          >
            <Play className="w-4 h-4" />
            <span>Start Demo</span>
          </Button>

          <Button
            onClick={() => handleDemoAction('stop')}
            disabled={loading || !isRunning}
            variant="secondary"
            className="flex items-center space-x-2"
          >
            <Square className="w-4 h-4" />
            <span>Stop Demo</span>
          </Button>

          <Button
            onClick={() => handleDemoAction('reset')}
            disabled={loading}
            variant="destructive"
            className="flex items-center space-x-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset & Reseed</span>
          </Button>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Gavel className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.auctions}</p>
                  <p className="text-sm text-muted-foreground">Auctions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Eye className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.lots}</p>
                  <p className="text-sm text-muted-foreground">Total Lots</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Bot className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.bots}</p>
                  <p className="text-sm text-muted-foreground">Bot Bidders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-8 h-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.total_bids}</p>
                  <p className="text-sm text-muted-foreground">Total Bids</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="live" className="space-y-4">
        <TabsList>
          <TabsTrigger value="live">Live Lots</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          {activeLots.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Timer className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Active Lots</h3>
                <p className="text-muted-foreground">Start the demo to see live auction timers</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeLots.map(lot => (
                <AuctionTimer
                  key={lot.id}
                  lot={lot}
                  className="h-full"
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Recent Bids</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentBids.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No recent bids</p>
              ) : (
                <div className="space-y-3">
                  {recentBids.map(bid => {
                    const isBot = bid.user.metadata?.is_bot
                    const timeAgo = Math.floor((Date.now() - new Date(bid.created_at).getTime()) / 1000)

                    return (
                      <div key={bid.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center space-x-3">
                          {isBot ? (
                            <Bot className="w-5 h-5 text-green-500" />
                          ) : (
                            <Users className="w-5 h-5 text-blue-500" />
                          )}
                          <div>
                            <p className="font-medium">
                              {bid.user.first_name} {isBot && '(Bot)'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Lot {bid.lot.lot_number}: {bid.lot.title}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{bid.amount_itc.toLocaleString()} ITC</p>
                          <p className="text-sm text-muted-foreground">{timeAgo}s ago</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Timing Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Lot Duration</span>
                  <span className="font-mono">{DEMO.LOT_DURATION_SEC}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Soft Close Window</span>
                  <span className="font-mono">{DEMO.SOFT_CLOSE_WINDOW_SEC}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Extension Time</span>
                  <span className="font-mono">{DEMO.SOFT_CLOSE_EXTEND_SEC}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Timer Tick Interval</span>
                  <span className="font-mono">{DEMO.TIMER_TICK_INTERVAL_MS}ms</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bot Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Bot Count</span>
                  <span className="font-mono">{DEMO.NUM_BOT_BIDDERS}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Bot Bid</span>
                  <span className="font-mono">{DEMO.BOT_MAX_BID_ITC.toLocaleString()} ITC</span>
                </div>
                <div className="flex justify-between">
                  <span>Bot Strategies</span>
                  <span className="font-mono">{DEMO.BOT_STRATEGIES.join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Throttle Range</span>
                  <span className="font-mono">{DEMO.BOT_THROTTLE_MS[0]}-{DEMO.BOT_THROTTLE_MS[1]}ms</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}