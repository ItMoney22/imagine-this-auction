'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Truck,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  ADMIN_STATUS_LABEL,
  DELIVERY_STATUSES,
  EVENT_LABEL,
  type DeliveryStatus,
} from '@/lib/delivery/state'

interface UserInfo {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
}

interface DriverRow {
  id: string
  status: string
  phone: string | null
  vehicle_type: string | null
  location_consent_at?: string | null
  users: UserInfo | null
}

interface DeliveryRow {
  id: string
  tracking_number: string
  tracking_token?: string
  status: DeliveryStatus
  package_barcode: string
  invoice_id: string
  created_at: string
  eta_window_start: string | null
  eta_window_end: string | null
  customer: UserInfo | null
  driver: DriverRow | null
  lot: { id: string; title: string } | null
}

interface EventRow {
  id: string
  event_type: string
  actor_role: string | null
  notes: string | null
  lat: number | null
  lng: number | null
  created_at: string
  metadata: Record<string, unknown> | null
}

interface LocationPoint {
  lat: number
  lng: number
  recorded_at: string
}

function personName(u: UserInfo | null): string {
  if (!u) return '—'
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ')
  return name || u.email
}

const STATUS_BADGE: Partial<Record<DeliveryStatus, string>> = {
  delivered: 'bg-emerald-100 text-emerald-800',
  exception: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-200 text-slate-600',
  out_for_delivery: 'bg-indigo-100 text-indigo-800',
}

// ─── Google Map (loads only when a key is configured) ───────────────────────
function DeliveryMap({ locations, delivered }: { locations: LocationPoint[]; delivered: { lat: number | null; lng: number | null } }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!apiKey) return
    const w = window as any
    if (w.google?.maps) {
      setReady(true)
      return
    }
    const existing = document.querySelector('script[data-gmaps]')
    if (existing) {
      existing.addEventListener('load', () => setReady(true))
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
    script.async = true
    script.dataset.gmaps = '1'
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [apiKey])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const w = window as any
    const points = locations.map((p) => ({ lat: p.lat, lng: p.lng }))
    if (delivered.lat != null && delivered.lng != null) {
      points.push({ lat: delivered.lat, lng: delivered.lng })
    }
    if (points.length === 0) return

    const map = new w.google.maps.Map(mapRef.current, {
      zoom: 13,
      center: points[points.length - 1],
      mapTypeControl: false,
      streetViewControl: false,
    })
    if (points.length > 1) {
      new w.google.maps.Polyline({
        path: points,
        map,
        strokeColor: '#6366f1',
        strokeWeight: 3,
      })
    }
    new w.google.maps.Marker({ position: points[points.length - 1], map, title: 'Latest position' })
    const bounds = new w.google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend(p))
    if (points.length > 1) map.fitBounds(bounds)
  }, [ready, locations, delivered])

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Map unavailable — set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable it.
        {locations.length > 0 && (
          <span>
            {' '}Latest position:{' '}
            <a
              className="text-indigo-600 underline"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps?q=${locations[locations.length - 1].lat},${locations[locations.length - 1].lng}`}
            >
              open in Google Maps
            </a>
          </span>
        )}
      </div>
    )
  }
  if (locations.length === 0 && delivered.lat == null) {
    return <p className="text-sm text-slate-500">No location history recorded for this delivery.</p>
  }
  return <div ref={mapRef} className="h-72 w-full rounded-xl border border-slate-200" />
}

// ─── Main manager ────────────────────────────────────────────────────────────
export default function DeliveryManager() {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [locations, setLocations] = useState<LocationPoint[]>([])
  const [eventPhotoUrls, setEventPhotoUrls] = useState<Record<string, string>>({})
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [assignDriverId, setAssignDriverId] = useState('')
  const [newDriverEmail, setNewDriverEmail] = useState('')
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [showDrivers, setShowDrivers] = useState(false)

  const search = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/delivery?${params}`)
      const data = await res.json()
      if (res.ok) setDeliveries(data.deliveries ?? [])
      else toast.error(data.error ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [query, statusFilter])

  const loadDrivers = useCallback(async () => {
    const res = await fetch('/api/admin/drivers')
    const data = await res.json()
    if (res.ok) setDrivers(data.drivers ?? [])
  }, [])

  useEffect(() => {
    search()
    loadDrivers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const openDetail = useCallback(async (row: DeliveryRow) => {
    setSelected(row)
    const res = await fetch(`/api/delivery/${row.id}`)
    const data = await res.json()
    if (res.ok) {
      setSelected(data.delivery)
      setEvents(data.events ?? [])
      setLocations(data.locations ?? [])
      setEventPhotoUrls(data.event_photo_urls ?? {})
      setProofUrl(data.proof_photo_url ?? null)
      setSignatureUrl(data.signature_url ?? null)
    }
  }, [])

  // Live updates on the open delivery: Realtime first, polling as fallback
  useEffect(() => {
    if (!selected) return
    const supabase = createClient()
    const channel = supabase
      .channel(`delivery-${selected.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'delivery_events', filter: `delivery_id=eq.${selected.id}` },
        () => openDetail(selected)
      )
      .subscribe()
    const poll = setInterval(() => openDetail(selected), 30_000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const doAction = async (payload: Record<string, unknown>) => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch(`/api/delivery/${selected.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) toast.error(data.error ?? 'Action failed')
      else {
        toast.success('Done')
        await openDetail(selected)
        await search()
      }
    } finally {
      setBusy(false)
    }
  }

  const addDriver = async () => {
    if (!newDriverEmail.trim()) return
    const res = await fetch('/api/admin/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', email: newDriverEmail.trim(), phone: newDriverPhone.trim() || undefined }),
    })
    const data = await res.json()
    if (!res.ok) toast.error(data.error ?? 'Failed to add driver')
    else {
      toast.success('Driver added')
      setNewDriverEmail('')
      setNewDriverPhone('')
      await loadDrivers()
    }
  }

  const copyTrackingLink = () => {
    if (!selected?.tracking_token) return
    const url = `${window.location.origin}/track/${selected.tracking_number}?t=${selected.tracking_token}`
    navigator.clipboard.writeText(url)
    toast.success('Customer tracking link copied')
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="delivery-search">Search</Label>
            <Input
              id="delivery-search"
              placeholder="Order #, barcode, tracking #, customer, or driver"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {DELIVERY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ADMIN_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={search} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
          <Button variant="outline" onClick={() => setShowDrivers((v) => !v)}>
            <Truck className="mr-2 h-4 w-4" /> Drivers ({drivers.length})
          </Button>
        </CardContent>
      </Card>

      {/* Driver roster */}
      {showDrivers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Driver roster</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 space-y-1">
                <Label>Existing account email</Label>
                <Input
                  placeholder="driver@example.com"
                  value={newDriverEmail}
                  onChange={(e) => setNewDriverEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input placeholder="(555) 000-0000" value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} />
              </div>
              <Button onClick={addDriver}>
                <UserPlus className="mr-2 h-4 w-4" /> Add driver
              </Button>
            </div>
            <div className="divide-y">
              {drivers.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">{personName(d.users)}</span>
                    <span className="ml-2 text-slate-500">{d.phone ?? 'no phone'}</span>
                  </div>
                  <Select
                    value={d.status}
                    onValueChange={async (status) => {
                      await fetch('/api/admin/drivers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update', driver_id: d.id, status }),
                      })
                      loadDrivers()
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {drivers.length === 0 && <p className="py-3 text-sm text-slate-500">No drivers yet.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results + detail */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Deliveries ({deliveries.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[36rem] space-y-2 overflow-y-auto">
            {deliveries.map((row) => (
              <button
                key={row.id}
                onClick={() => openDetail(row)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${selected?.id === row.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{row.tracking_number}</span>
                  <Badge className={STATUS_BADGE[row.status] ?? ''} variant="secondary">
                    {ADMIN_STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {row.lot?.title ?? 'Package'} → {personName(row.customer)}
                  {row.driver?.users ? ` · Driver: ${personName(row.driver.users)}` : ''}
                </p>
              </button>
            ))}
            {deliveries.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-slate-500">No deliveries found.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          {!selected ? (
            <CardContent className="flex h-full items-center justify-center py-24 text-sm text-slate-400">
              Select a delivery to see its audit trail, map, and actions.
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">{selected.tracking_number}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_BADGE[selected.status] ?? ''} variant="secondary">
                      {ADMIN_STATUS_LABEL[selected.status] ?? selected.status}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={copyTrackingLink}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Tracking link
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openDetail(selected)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  {selected.lot?.title ?? 'Package'} · Customer: {personName(selected.customer)} · Barcode:{' '}
                  <code className="text-xs">{selected.package_barcode}</code>
                </p>
                {selected.driver && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Truck className="h-4 w-4" /> {personName(selected.driver.users)}
                    {selected.driver.phone && (
                      <a href={`tel:${selected.driver.phone}`} className="flex items-center gap-1 text-indigo-600 hover:underline">
                        <Phone className="h-3.5 w-3.5" /> {selected.driver.phone}
                      </a>
                    )}
                    {selected.driver.users?.email && (
                      <a href={`mailto:${selected.driver.users.email}`} className="text-indigo-600 hover:underline">
                        {selected.driver.users.email}
                      </a>
                    )}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {selected.status === 'created' && (
                    <Button size="sm" disabled={busy} onClick={() => doAction({ action: 'offer' })}>
                      Send offer to drivers
                    </Button>
                  )}
                  {['created', 'offered', 'exception'].includes(selected.status) && (
                    <div className="flex items-center gap-1">
                      <Select value={assignDriverId} onValueChange={setAssignDriverId}>
                        <SelectTrigger className="h-9 w-44">
                          <SelectValue placeholder="Assign driver…" />
                        </SelectTrigger>
                        <SelectContent>
                          {drivers
                            .filter((d) => d.status === 'active')
                            .map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {personName(d.users)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !assignDriverId}
                        onClick={() => doAction({ action: 'assign', driver_id: assignDriverId })}
                      >
                        Assign
                      </Button>
                    </div>
                  )}
                  {['claimed', 'arrived'].includes(selected.status) && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => doAction({ action: 'handoff' })}>
                        Confirm warehouse handoff
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => doAction({ action: 'reassign' })}>
                        Reassign
                      </Button>
                    </>
                  )}
                  {selected.status === 'exception' && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => doAction({ action: 'resolve', resolution: 'resume' })}>
                        Resume delivery
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => doAction({ action: 'resolve', resolution: 'reoffer' })}>
                        Re-offer to drivers
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => doAction({ action: 'resolve', resolution: 'returned' })}>
                        Return to warehouse
                      </Button>
                    </>
                  )}
                  {selected.status === 'failed' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => doAction({ action: 'resolve', resolution: 'returned' })}>
                      Mark returned to warehouse
                    </Button>
                  )}
                  {!['delivered', 'returned', 'cancelled', 'failed'].includes(selected.status) && (
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => doAction({ action: 'cancel' })}>
                      Cancel delivery
                    </Button>
                  )}
                </div>

                {selected.status === 'exception' && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4" /> This delivery needs attention — see the latest exception below.
                  </div>
                )}

                {/* Map / history */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <MapPin className="h-4 w-4" /> Route history
                  </p>
                  <DeliveryMap
                    locations={locations}
                    delivered={{
                      lat: (selected as unknown as { delivered_lat: number | null }).delivered_lat ?? null,
                      lng: (selected as unknown as { delivered_lng: number | null }).delivered_lng ?? null,
                    }}
                  />
                </div>

                {/* Proof */}
                {(proofUrl || signatureUrl) && (
                  <div className="flex gap-4">
                    {proofUrl && (
                      <a href={proofUrl} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proofUrl} alt="Proof of delivery" className="h-28 rounded-lg border object-cover" />
                        <span className="text-xs text-slate-500">Proof photo</span>
                      </a>
                    )}
                    {signatureUrl && (
                      <a href={signatureUrl} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signatureUrl} alt="Signature" className="h-28 rounded-lg border bg-white object-contain" />
                        <span className="text-xs text-slate-500">Signature</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Audit trail */}
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Event audit trail</p>
                  <ol className="space-y-3">
                    {[...events].reverse().map((event) => (
                      <li key={event.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">
                            {EVENT_LABEL[event.event_type] ?? event.event_type}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {event.actor_role ? `${event.actor_role} · ` : ''}
                          {event.notes ?? ''}
                          {event.lat != null && event.lng != null && (
                            <>
                              {' '}
                              <a
                                className="text-indigo-600 underline"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://www.google.com/maps?q=${event.lat},${event.lng}`}
                              >
                                location
                              </a>
                            </>
                          )}
                        </p>
                        {eventPhotoUrls[event.id] && (
                          <a href={eventPhotoUrls[event.id]} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={eventPhotoUrls[event.id]} alt="Event photo" className="mt-1 h-16 rounded border object-cover" />
                          </a>
                        )}
                      </li>
                    ))}
                    {events.length === 0 && <p className="text-sm text-slate-500">No events yet.</p>}
                  </ol>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
