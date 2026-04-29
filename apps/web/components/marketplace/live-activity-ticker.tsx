'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, Zap } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ActivityEvent {
  id: string
  type: 'bid' | 'watch'
  amount?: number
  bidder_name?: string
  is_proxy?: boolean
  ts: number
}

interface Props {
  lotId: string
  initialBidderCount?: number
}

export function LiveActivityTicker({ lotId, initialBidderCount = 0 }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [watching, setWatching] = useState(initialBidderCount)
  const supabase = createClient()

  useEffect(() => {
    const bidsChannel = supabase
      .channel(`activity:lot:${lotId}:bids`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `lot_id=eq.${lotId}` },
        async (payload) => {
          const bid = payload.new as { id: string; amount: number; bidder_id: string; is_proxy?: boolean }
          const { data: bidder } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', bid.bidder_id)
            .maybeSingle()
          const name = bidder
            ? bidder.first_name
              ? `${bidder.first_name}${bidder.last_name ? ' ' + bidder.last_name[0] + '.' : ''}`
              : (bidder.email?.split('@')[0] ?? 'A bidder')
            : 'A bidder'
          setEvents((prev) =>
            [
              {
                id: bid.id,
                type: 'bid' as const,
                amount: bid.amount,
                bidder_name: name,
                is_proxy: bid.is_proxy,
                ts: Date.now(),
              },
              ...prev,
            ].slice(0, 8)
          )
        }
      )
      .subscribe()

    const presenceChannel = supabase.channel(`presence:lot:${lotId}`, {
      config: { presence: { key: crypto.randomUUID() } },
    })
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        setWatching(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await presenceChannel.track({ at: Date.now() })
      })

    return () => {
      supabase.removeChannel(bidsChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [lotId, supabase])

  const fmtAge = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 5) return 'just now'
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Zap className="h-4 w-4 text-amber-500" />
          Live activity
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <Eye className="h-3.5 w-3.5" />
          <span>{watching} watching now</span>
        </div>
      </div>
      <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            Waiting for the next bid…
          </div>
        ) : (
          events.map((e, i) => (
            <div
              key={e.id}
              className={cn(
                'px-4 py-2.5 text-sm flex items-center justify-between transition-colors',
                i === 0 && 'bg-amber-50/60'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-slate-900 truncate">{e.bidder_name}</span>
                {e.is_proxy && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">
                    auto
                  </span>
                )}
                <span className="text-slate-500 whitespace-nowrap">bid</span>
                <span className="font-semibold text-emerald-600 whitespace-nowrap">
                  {e.amount !== undefined ? formatCurrency(e.amount) : ''}
                </span>
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap ml-2">{fmtAge(e.ts)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
