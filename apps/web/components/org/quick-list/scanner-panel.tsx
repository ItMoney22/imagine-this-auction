'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  Camera,
  ImagePlus,
  Loader2,
  ScanBarcode,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { classifyScan, SCAN_FORMAT_LABEL } from '@/lib/ai/quick-listing'

export interface CapturedPhoto {
  id: string
  file: File
  previewUrl: string
}

interface ScannerPanelProps {
  scanValue: string
  onScanValueChange: (value: string) => void
  photos: CapturedPhoto[]
  onAddPhotos: (files: File[]) => void
  onRemovePhoto: (id: string) => void
  manualContext: string
  onManualContextChange: (value: string) => void
  disabled?: boolean
  uploading?: boolean
}

/**
 * Capture step: scan a barcode with the device camera (or type any code) and
 * take/upload the photos that become the lot's verified originals.
 */
export function ScannerPanel({
  scanValue,
  onScanValueChange,
  photos,
  onAddPhotos,
  onRemovePhoto,
  manualContext,
  onManualContextChange,
  disabled = false,
  uploading = false,
}: ScannerPanelProps) {
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [barcodeSupported, setBarcodeSupported] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // BarcodeDetector is native in Chrome/Edge/Android and Safari 17+. Where it
    // is missing we fall back to manual entry rather than shipping a scanner
    // library the auctioneer has to download on a phone.
    setBarcodeSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  const stopScanner = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
  }

  useEffect(() => stopScanner, [])

  const startScanner = async () => {
    setScanError(null)

    if (!barcodeSupported) {
      setScanError('This browser cannot scan barcodes. Type the code instead.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })

      streamRef.current = stream
      setScanning(true)

      // The <video> only exists once `scanning` is true, so attach on next frame.
      requestAnimationFrame(async () => {
        if (!videoRef.current) return

        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)

        const DetectorCtor = (window as any).BarcodeDetector
        const detector = new DetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'],
        })

        const tick = async () => {
          if (!videoRef.current || !streamRef.current) return

          try {
            const results = await detector.detect(videoRef.current)
            if (results?.length > 0 && results[0].rawValue) {
              onScanValueChange(String(results[0].rawValue))
              stopScanner()
              return
            }
          } catch {
            // Transient decode failures are normal between frames.
          }

          rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
      })
    } catch (error) {
      setScanError(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Camera access was denied. Type the code instead.'
          : 'Could not open the camera. Type the code instead.'
      )
      stopScanner()
    }
  }

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) onAddPhotos(files)
    event.target.value = ''
  }

  const classified = scanValue.trim() ? classifyScan(scanValue) : null

  return (
    <div className="space-y-5">
      {/* --- Scan --- */}
      <section className="space-y-3 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <ScanBarcode className="h-4 w-4 text-indigo-600" />
              Scan a code
            </h3>
            <p className="text-xs text-slate-500">
              UPC, EAN, ISBN or your own SKU. Optional — photos alone work too.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={scanning ? stopScanner : startScanner}
            disabled={disabled}
          >
            {scanning ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <ScanLine className="mr-2 h-4 w-4" />
                Scan with camera
              </>
            )}
          </Button>
        </div>

        {scanning && (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-56 w-full object-cover sm:h-64"
            />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/90">
              Line the barcode up with the red line
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="quick-list-scan">Code</Label>
          <div className="flex gap-2">
            <Input
              id="quick-list-scan"
              value={scanValue}
              onChange={(event) => onScanValueChange(event.target.value)}
              placeholder="e.g. 9780262033848"
              inputMode="text"
              autoComplete="off"
              disabled={disabled}
            />
            {scanValue && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => onScanValueChange('')}
                aria-label="Clear code"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {classified && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{SCAN_FORMAT_LABEL[classified.format]}</Badge>
              {!classified.checksumValid && (
                <Badge variant="destructive">Checksum failed — may be misread</Badge>
              )}
            </div>
          )}

          {scanError && <p className="text-xs text-amber-700">{scanError}</p>}
          {!barcodeSupported && !scanError && (
            <p className="text-xs text-slate-500">
              Camera scanning isn’t available in this browser — type the code above.
            </p>
          )}
        </div>
      </section>

      {/* --- Photos --- */}
      <section className="space-y-3 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm sm:p-5">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Camera className="h-4 w-4 text-emerald-600" />
            Item photos
          </h3>
          <p className="text-xs text-slate-500">
            These are stored unaltered as the buyer’s{' '}
            <strong className="text-emerald-700">Verified Original Photos</strong>. Capture any
            damage or wear now — AI is never allowed to remove it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <label
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50',
              disabled && 'pointer-events-none opacity-50'
            )}
          >
            <Camera className="h-4 w-4" />
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFiles}
              disabled={disabled}
            />
          </label>

          <label
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50',
              disabled && 'pointer-events-none opacity-50'
            )}
          >
            <ImagePlus className="h-4 w-4" />
            Upload
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
              disabled={disabled}
            />
          </label>

          {uploading && (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </span>
          )}
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                <Image
                  src={photo.previewUrl}
                  alt={`Item photo ${index + 1}`}
                  fill
                  unoptimized
                  sizes="120px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.id)}
                  disabled={disabled}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:hidden"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {index === 0 && (
                  <span className="absolute inset-x-0 bottom-0 bg-emerald-600/90 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">
                    Main
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Notes --- */}
      <section className="space-y-2 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm sm:p-5">
        <Label htmlFor="quick-list-context">Notes for the AI (optional)</Label>
        <Textarea
          id="quick-list-context"
          value={manualContext}
          onChange={(event) => onManualContextChange(event.target.value)}
          rows={3}
          maxLength={1000}
          disabled={disabled}
          placeholder="Anything the photos don't show — e.g. 'powers on, no remote', 'from a 1970s estate', 'chip on the base'."
        />
        <p className="text-right text-xs text-slate-400">{manualContext.length}/1000</p>
      </section>
    </div>
  )
}
