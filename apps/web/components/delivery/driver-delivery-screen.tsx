'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  ScanBarcode,
  Truck,
  Warehouse,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ADMIN_STATUS_LABEL,
  EVENT_LABEL,
  EXCEPTION_REASONS,
  EXCEPTION_REASON_LABEL,
  LOCATION_ACTIVE_STATUSES,
  type DeliveryStatus,
  type ExceptionReason,
} from '@/lib/delivery/state'

interface DeliveryDetail {
  id: string
  tracking_number: string
  status: DeliveryStatus
  package_barcode: string
  signature_required: boolean
  pickup_address: Record<string, string> | null
  dropoff_address: Record<string, string> | null
  location_consent?: string | null
}

interface EventRow {
  id: string
  event_type: string
  created_at: string
  notes: string | null
}

const POLL_MS = 15_000
const PING_INTERVAL_MS = 25_000

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function addressBlock(addr: Record<string, string> | null): string {
  if (!addr) return 'No address on file'
  return [addr.name, addr.line1, addr.line2, [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '), addr.phone, addr.instructions]
    .filter(Boolean)
    .join('\n')
}

export function DriverDeliveryScreen({ deliveryId }: { deliveryId: string }) {
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [consentAt, setConsentAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pickup scan state
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanLoopRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Proof of delivery state
  const [proofPhoto, setProofPhoto] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const sigDrawnRef = useRef(false)

  // Exception state
  const [showException, setShowException] = useState(false)
  const [exceptionReason, setExceptionReason] = useState<ExceptionReason | ''>('')
  const [exceptionNotes, setExceptionNotes] = useState('')
  const [exceptionPhoto, setExceptionPhoto] = useState<string | null>(null)

  // Location ping machinery
  const pingStopRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/delivery/${deliveryId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load delivery')
        return
      }
      setDelivery(data.delivery)
      setEvents(data.events ?? [])
      setError(null)
    } catch {
      setError('Failed to load delivery')
    } finally {
      setLoading(false)
    }
  }, [deliveryId])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    // Consent state comes from the jobs endpoint
    fetch('/api/driver/jobs')
      .then((r) => r.json())
      .then((d) => setConsentAt(d.driver?.location_consent_at ?? null))
      .catch(() => {})
    return () => clearInterval(interval)
  }, [load])

  const getPosition = (): Promise<{ lat: number; lng: number; accuracy_m?: number } | null> =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy ?? undefined,
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
      )
    })

  // Consent-gated pings while the delivery is active. Server enforces the same
  // rules and answers 410 when tracking must stop.
  useEffect(() => {
    if (!delivery || !consentAt) return
    if (!LOCATION_ACTIVE_STATUSES.includes(delivery.status)) return

    pingStopRef.current = false
    const tick = async () => {
      if (pingStopRef.current) return
      const point = await getPosition()
      if (!point || pingStopRef.current) return
      try {
        const res = await fetch('/api/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delivery_id: deliveryId, points: [point] }),
        })
        if (res.status === 410) pingStopRef.current = true
      } catch {
        // transient network failure — try again next tick
      }
    }
    tick()
    const interval = setInterval(tick, PING_INTERVAL_MS)
    return () => {
      pingStopRef.current = true
      clearInterval(interval)
    }
  }, [delivery, consentAt, deliveryId])

  const act = async (payload: Record<string, unknown>, successMessage?: string) => {
    setBusy(true)
    try {
      const point = await getPosition()
      const res = await fetch(`/api/driver/jobs/${deliveryId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, lat: point?.lat, lng: point?.lng }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Action failed')
        return false
      }
      if (successMessage) toast.success(successMessage)
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  // ── Barcode scanning (native BarcodeDetector, manual fallback) ────────────
  const stopScanner = useCallback(() => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current)
    scanLoopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => () => stopScanner(), [stopScanner])

  const startScanner = async () => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      toast.error('Camera scanning not supported on this device — type the code instead')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      setScanning(true)
      await new Promise((r) => setTimeout(r, 50))
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const DetectorCtor = (window as any).BarcodeDetector
      const detector = new DetectorCtor()
      const scanFrame = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) {
            const value = String(codes[0].rawValue ?? '').trim()
            if (value) {
              stopScanner()
              const ok = await act({ action: 'pickup_scan', barcode: value }, 'Pickup confirmed!')
              if (!ok) setManualCode(value)
              return
            }
          }
        } catch {
          // detection errors are transient — keep scanning
        }
        scanLoopRef.current = requestAnimationFrame(scanFrame)
      }
      scanLoopRef.current = requestAnimationFrame(scanFrame)
    } catch {
      toast.error('Could not access the camera — type the code instead')
      stopScanner()
    }
  }

  // ── Signature canvas ──────────────────────────────────────────────────────
  const sigStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    const move = (ev: PointerEvent) => {
      ctx.lineTo(ev.clientX - rect.left, ev.clientY - rect.top)
      ctx.stroke()
      sigDrawnRef.current = true
    }
    const up = () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
  }

  const clearSignature = () => {
    const canvas = sigCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    sigDrawnRef.current = false
  }

  const submitDelivery = async () => {
    if (!delivery) return
    if (!proofPhoto) {
      toast.error('Take a proof-of-delivery photo first')
      return
    }
    let signature: string | undefined
    if (delivery.signature_required) {
      if (!recipientName.trim()) {
        toast.error('Recipient name is required for this delivery')
        return
      }
      if (!sigDrawnRef.current || !sigCanvasRef.current) {
        toast.error('Recipient signature is required for this delivery')
        return
      }
      signature = sigCanvasRef.current.toDataURL('image/png')
    }
    await act(
      {
        action: 'deliver',
        photo: proofPhoto,
        signature,
        recipient_name: recipientName.trim() || undefined,
        notes: deliveryNotes.trim() || undefined,
      },
      'Delivery complete — nice work!'
    )
  }

  const submitException = async () => {
    if (!exceptionReason) {
      toast.error('Pick an exception reason')
      return
    }
    const ok = await act(
      {
        action: 'exception',
        reason: exceptionReason,
        notes: exceptionNotes.trim() || undefined,
        photo: exceptionPhoto ?? undefined,
      },
      'Exception reported — dispatch has been notified'
    )
    if (ok) {
      setShowException(false)
      setExceptionReason('')
      setExceptionNotes('')
      setExceptionPhoto(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading delivery…
      </div>
    )
  }

  if (error || !delivery) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-600">{error ?? 'Delivery not found'}</CardContent>
      </Card>
    )
  }

  const status = delivery.status
  const isActive = LOCATION_ACTIVE_STATUSES.includes(status)

  return (
    <div className="space-y-5">
      <Link href="/driver" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
        <ArrowLeft className="h-4 w-4" /> All jobs
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{delivery.tracking_number}</CardTitle>
            <Badge>{ADMIN_STATUS_LABEL[status] ?? status}</Badge>
          </div>
          {isActive && consentAt && (
            <p className="flex items-center gap-1 text-xs text-emerald-600">
              <MapPin className="h-3 w-3" /> Location sharing active for this delivery
            </p>
          )}
          {isActive && !consentAt && (
            <p className="text-xs text-slate-500">
              Location sharing is off — enable it on your dashboard if agreed with dispatch.
            </p>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Warehouse className="h-3.5 w-3.5" /> Pickup
            </p>
            <p className="whitespace-pre-line text-sm text-slate-700">{addressBlock(delivery.pickup_address)}</p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <MapPin className="h-3.5 w-3.5" /> Dropoff
            </p>
            <p className="whitespace-pre-line text-sm text-slate-700">{addressBlock(delivery.dropoff_address)}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Step actions by status ── */}
      {status === 'claimed' && (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm text-slate-600">Head to the warehouse, then confirm your arrival.</p>
            <Button className="w-full" disabled={busy} onClick={() => act({ action: 'arrive' }, 'Arrival logged')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Warehouse className="mr-2 h-4 w-4" /> I&apos;ve arrived at the warehouse</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {(status === 'claimed' || status === 'arrived') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Confirm pickup — scan the package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              You must scan the package barcode before you can start the delivery.
            </p>
            {scanning ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={videoRef} className="w-full rounded-xl border border-slate-200" playsInline muted />
                <Button variant="outline" className="w-full" onClick={stopScanner}>
                  Stop scanning
                </Button>
              </div>
            ) : (
              <Button className="w-full" disabled={busy} onClick={startScanner}>
                <ScanBarcode className="mr-2 h-4 w-4" /> Scan package barcode
              </Button>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="…or type the code from the label"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || !manualCode.trim()}
                onClick={() => act({ action: 'pickup_scan', barcode: manualCode.trim() }, 'Pickup confirmed!')}
              >
                Confirm
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'picked_up' && (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Pickup confirmed. Ready to roll?
            </p>
            <Button className="w-full" disabled={busy} onClick={() => act({ action: 'out_for_delivery' }, 'Marked out for delivery')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Truck className="mr-2 h-4 w-4" /> Start delivery</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'out_for_delivery' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Complete delivery — proof required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Proof-of-delivery photo (required)</Label>
              <div className="flex items-center gap-3">
                <Button asChild variant="outline">
                  <label className="cursor-pointer">
                    <Camera className="mr-2 h-4 w-4" /> {proofPhoto ? 'Retake photo' : 'Take photo'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) setProofPhoto(await fileToDataUrl(file))
                      }}
                    />
                  </label>
                </Button>
                {proofPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proofPhoto} alt="Proof of delivery" className="h-16 w-16 rounded-lg object-cover" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipient">
                Recipient name {delivery.signature_required ? '(required)' : '(optional)'}
              </Label>
              <Input
                id="recipient"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Who received the package?"
              />
            </div>

            {delivery.signature_required && (
              <div className="space-y-2">
                <Label>Recipient signature (required)</Label>
                <canvas
                  ref={sigCanvasRef}
                  width={560}
                  height={160}
                  onPointerDown={sigStart}
                  className="w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
                />
                <Button variant="ghost" size="sm" onClick={clearSignature}>
                  Clear signature
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Delivery notes (optional)</Label>
              <Textarea
                id="notes"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Left with neighbor, behind gate, etc."
              />
            </div>

            <Button className="w-full" disabled={busy} onClick={submitDelivery}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Mark delivered</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Exceptions ── */}
      {isActive && (
        <Card className={showException ? 'border-amber-300' : ''}>
          <CardContent className="space-y-3 py-5">
            {!showException ? (
              <Button variant="outline" className="w-full text-amber-700" onClick={() => setShowException(true)}>
                <AlertTriangle className="mr-2 h-4 w-4" /> Report a problem
              </Button>
            ) : (
              <>
                <Label>What went wrong?</Label>
                <Select value={exceptionReason} onValueChange={(v) => setExceptionReason(v as ExceptionReason)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {EXCEPTION_REASON_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={exceptionNotes}
                  onChange={(e) => setExceptionNotes(e.target.value)}
                  placeholder="Add details for dispatch…"
                />
                <div className="flex items-center gap-3">
                  <Button asChild variant="outline" size="sm">
                    <label className="cursor-pointer">
                      <Camera className="mr-2 h-4 w-4" /> {exceptionPhoto ? 'Retake photo' : 'Add photo'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) setExceptionPhoto(await fileToDataUrl(file))
                        }}
                      />
                    </label>
                  </Button>
                  {exceptionPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={exceptionPhoto} alt="Exception" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" variant="destructive" disabled={busy} onClick={submitException}>
                    Submit report
                  </Button>
                  <Button variant="ghost" onClick={() => setShowException(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {[...events].reverse().map((event) => (
              <li key={event.id} className="text-sm">
                <p className="font-medium text-slate-800">
                  {EVENT_LABEL[event.event_type] ?? event.event_type}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(event.created_at).toLocaleString()}
                  {event.notes ? ` — ${event.notes}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
