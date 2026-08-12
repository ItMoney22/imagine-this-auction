'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MapPin, Package, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ADMIN_STATUS_LABEL } from '@/lib/delivery/state'

interface JobSummary {
  id: string
  tracking_number: string
  status: string
  pickup_address: { line1?: string; city?: string } | null
  dropoff_address: { line1?: string; city?: string } | null
  weight_g: number | null
  eta_window_start: string | null
  eta_window_end: string | null
  lot: { title: string } | null
}

interface OfferRow {
  id: string
  delivery: JobSummary & { offer_expires_at: string | null }
}

const POLL_MS = 20_000

function addressLine(addr: JobSummary['pickup_address']): string {
  if (!addr) return '—'
  return [addr.line1, addr.city].filter(Boolean).join(', ')
}

export function DriverJobs() {
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [active, setActive] = useState<JobSummary[]>([])
  const [consentAt, setConsentAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/jobs')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load jobs')
        return
      }
      setOffers(data.offers ?? [])
      setActive(data.active ?? [])
      setConsentAt(data.driver?.location_consent_at ?? null)
      setError(null)
    } catch {
      setError('Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [load])

  const respond = async (deliveryId: string, action: 'claim' | 'decline') => {
    setBusy(deliveryId)
    try {
      const res = await fetch(`/api/driver/jobs/${deliveryId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? `Failed to ${action}`)
      } else {
        toast.success(action === 'claim' ? 'Job claimed — head to the warehouse!' : 'Offer declined')
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const toggleConsent = async (consent: boolean) => {
    const res = await fetch('/api/driver/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to update consent')
      return
    }
    setConsentAt(data.location_consent_at)
    toast.success(consent ? 'Location sharing enabled for active deliveries' : 'Location sharing disabled')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your jobs…
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-600">{error}</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">Location sharing while on a delivery</p>
              <p className="text-xs text-slate-500">
                Only tracked while you&apos;re actively on a job. Stops automatically when the
                delivery completes. You can turn this off any time.
              </p>
            </div>
          </div>
          <Switch checked={!!consentAt} onCheckedChange={toggleConsent} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available offers ({offers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {offers.length === 0 && (
            <p className="text-sm text-slate-500">No open offers right now — check back soon.</p>
          )}
          {offers.map((offer) => (
            <div key={offer.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">
                  {offer.delivery.lot?.title ?? 'Package'}{' '}
                  <span className="text-xs text-slate-400">{offer.delivery.tracking_number}</span>
                </p>
                {offer.delivery.offer_expires_at && (
                  <Badge variant="outline">
                    Expires {new Date(offer.delivery.offer_expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Badge>
                )}
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <p className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Pickup: {addressLine(offer.delivery.pickup_address)}
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Dropoff: {addressLine(offer.delivery.dropoff_address)}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={busy === offer.delivery.id}
                  onClick={() => respond(offer.delivery.id, 'claim')}
                >
                  {busy === offer.delivery.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim job'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === offer.delivery.id}
                  onClick={() => respond(offer.delivery.id, 'decline')}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My active deliveries ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.length === 0 && (
            <p className="text-sm text-slate-500">No active deliveries.</p>
          )}
          {active.map((job) => (
            <Link
              key={job.id}
              href={`/driver/jobs/${job.id}`}
              className="block rounded-xl border border-slate-200 p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">
                  {job.lot?.title ?? 'Package'}{' '}
                  <span className="text-xs text-slate-400">{job.tracking_number}</span>
                </p>
                <Badge>{ADMIN_STATUS_LABEL[job.status as keyof typeof ADMIN_STATUS_LABEL] ?? job.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Dropoff: {addressLine(job.dropoff_address)}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
