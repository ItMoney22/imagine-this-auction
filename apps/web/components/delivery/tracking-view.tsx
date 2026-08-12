'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, Package, Truck } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TimelineEntry {
  label: string
  at: string
}

interface CustomerDelivery {
  tracking_number: string
  status: string
  status_label: string
  eta_window_start: string | null
  eta_window_end: string | null
  delivered_at: string | null
  recipient_name: string | null
  timeline: TimelineEntry[]
}

const PROGRESS_STEPS: Array<{ label: string; statuses: string[] }> = [
  { label: 'Preparing', statuses: ['created', 'offered'] },
  { label: 'Driver assigned', statuses: ['claimed', 'arrived'] },
  { label: 'Picked up', statuses: ['picked_up'] },
  { label: 'Out for delivery', statuses: ['out_for_delivery'] },
  { label: 'Delivered', statuses: ['delivered'] },
]

function progressIndex(status: string): number {
  const idx = PROGRESS_STEPS.findIndex((s) => s.statuses.includes(status))
  if (idx >= 0) return idx
  if (status === 'delivered') return PROGRESS_STEPS.length - 1
  return 0
}

function formatWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return fmt((start ?? end) as string)
}

const POLL_MS = 30_000

export function TrackingView({
  trackingNumber,
  token,
}: {
  trackingNumber: string
  token: string | null
}) {
  const [delivery, setDelivery] = useState<CustomerDelivery | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const url = `/api/track/${encodeURIComponent(trackingNumber)}${token ? `?t=${encodeURIComponent(token)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Unable to load tracking information')
        setDelivery(null)
      } else {
        setDelivery(data.delivery)
        setError(null)
      }
    } catch {
      setError('Unable to load tracking information')
    } finally {
      setLoading(false)
    }
  }, [trackingNumber, token])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading tracking…
      </div>
    )
  }

  if (error || !delivery) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-600">
          <Package className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          {error ?? 'Tracking information unavailable'}
        </CardContent>
      </Card>
    )
  }

  const activeIdx = progressIndex(delivery.status)
  const etaWindow = formatWindow(delivery.eta_window_start, delivery.eta_window_end)
  const isProblem = ['exception', 'failed', 'returned', 'cancelled'].includes(delivery.status)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Tracking {delivery.tracking_number}
          </p>
          <CardTitle className="text-3xl">
            {delivery.status === 'out_for_delivery' && (
              <Truck className="mr-2 inline h-7 w-7 text-indigo-600" />
            )}
            {delivery.status_label}
          </CardTitle>
          {delivery.status === 'delivered' && delivery.delivered_at && (
            <p className="text-sm text-slate-600">
              Delivered {new Date(delivery.delivered_at).toLocaleString()}
              {delivery.recipient_name ? ` — received by ${delivery.recipient_name}` : ''}
            </p>
          )}
          {!isProblem && delivery.status !== 'delivered' && etaWindow && (
            <p className="text-sm text-slate-600">
              Estimated delivery: <span className="font-medium">{etaWindow}</span>
            </p>
          )}
          {isProblem && (
            <Badge variant="secondary" className="mx-auto mt-1">
              Our team is on it — check back for updates
            </Badge>
          )}
        </CardHeader>

        {!isProblem && (
          <CardContent>
            <div className="flex items-center justify-between">
              {PROGRESS_STEPS.map((step, i) => (
                <div key={step.label} className="flex flex-1 flex-col items-center text-center">
                  {i <= activeIdx ? (
                    <CheckCircle2 className="h-6 w-6 text-indigo-600" />
                  ) : (
                    <Circle className="h-6 w-6 text-slate-300" />
                  )}
                  <span
                    className={`mt-1 text-[11px] leading-tight ${i <= activeIdx ? 'font-semibold text-slate-800' : 'text-slate-400'}`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delivery timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {delivery.timeline.length === 0 ? (
            <p className="text-sm text-slate-500">No updates yet.</p>
          ) : (
            <ol className="space-y-4">
              {[...delivery.timeline].reverse().map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="flex gap-3">
                  <div
                    className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${i === 0 ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  />
                  <div>
                    <p className={`text-sm ${i === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                      {entry.label}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(entry.at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-400">
        Updates refresh automatically. Questions? Reply to your order confirmation email.
      </p>
    </div>
  )
}
