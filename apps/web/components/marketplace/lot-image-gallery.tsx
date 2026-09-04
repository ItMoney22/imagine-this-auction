'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Info, Package, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  AI_ENHANCED_LABEL,
  AI_IMAGE_DISCLOSURE,
  IMAGE_VARIANT_LABEL,
  VERIFIED_ORIGINALS_LABEL,
  type LotImageRecord,
} from '@/lib/ai/quick-listing'

interface LotImageGalleryProps {
  title: string
  originalImages: LotImageRecord[]
  generatedImages: LotImageRecord[]
  /** Fallback for lots created before lot_images existed. */
  legacyImageUrls?: string[]
}

type GalleryTab = 'original' | 'ai'

/**
 * Buyer-facing lot imagery.
 *
 * Verified original photos are the default view and always render first. AI
 * presentation images live behind a separate, explicitly labelled tab, carry
 * the disclosure on every frame and thumbnail, and can never be the lot's
 * primary image.
 */
export function LotImageGallery({
  title,
  originalImages,
  generatedImages,
  legacyImageUrls = [],
}: LotImageGalleryProps) {
  const originals = useMemo(() => {
    if (originalImages.length > 0) return originalImages

    // Lots listed before the AI feature stored URLs on `lots.images` only.
    // Those are unmodified uploads, so they are verified originals too.
    return legacyImageUrls.map((url, index) => ({
      id: `legacy-${index}`,
      public_url: url,
      kind: 'original' as const,
      position: index,
    })) as unknown as LotImageRecord[]
  }, [originalImages, legacyImageUrls])

  const [tab, setTab] = useState<GalleryTab>('original')
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(new Set())

  const active = tab === 'original' ? originals : generatedImages
  const current = active[Math.min(index, Math.max(active.length - 1, 0))]
  const hasAiImages = generatedImages.length > 0

  const switchTab = (next: GalleryTab) => {
    setTab(next)
    setIndex(0)
  }

  const step = (delta: number) => {
    if (active.length === 0) return
    setIndex((prev) => (prev + delta + active.length) % active.length)
  }

  const markFailed = (id: string) => {
    setFailed((prev) => new Set(prev).add(id))
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Section switcher — originals first, always the default */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
          <button
            type="button"
            onClick={() => switchTab('original')}
            aria-pressed={tab === 'original'}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
              tab === 'original'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            {VERIFIED_ORIGINALS_LABEL}
            <span className="opacity-75">({originals.length})</span>
          </button>

          {hasAiImages && (
            <button
              type="button"
              onClick={() => switchTab('ai')}
              aria-pressed={tab === 'ai'}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                tab === 'ai'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              )}
            >
              <Sparkles className="h-4 w-4" />
              {AI_ENHANCED_LABEL}
              <span className="opacity-75">({generatedImages.length})</span>
            </button>
          )}
        </div>

        {tab === 'ai' && (
          <div className="flex items-start gap-2 border-b border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900 sm:text-sm">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{AI_IMAGE_DISCLOSURE}</p>
          </div>
        )}

        {/* Main image */}
        {current && !failed.has(current.id) ? (
          <div className="relative">
            <div className="relative aspect-square overflow-hidden bg-gray-100 md:aspect-video">
              <Image
                src={current.public_url}
                alt={
                  tab === 'ai'
                    ? `${title} — AI-generated presentation image ${index + 1}`
                    : `${title} — verified original photo ${index + 1}`
                }
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 66vw"
                className="object-cover"
                onError={() => markFailed(current.id)}
              />

              <div className="absolute left-4 top-4">
                {tab === 'ai' ? (
                  <Badge className="bg-indigo-600 text-white shadow-sm">
                    <Sparkles className="mr-1 h-3 w-3" />
                    AI-generated
                    {current.variant ? ` · ${IMAGE_VARIANT_LABEL[current.variant]}` : ''}
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-600 text-white shadow-sm">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Verified original
                  </Badge>
                )}
              </div>

              {active.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous image"
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next image"
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-4 right-4 rounded bg-black/60 px-3 py-1 text-sm text-white">
                    {index + 1} / {active.length}
                  </div>
                </>
              )}
            </div>

            {tab === 'ai' && (
              <p className="border-t border-gray-100 bg-white px-4 py-2 text-[11px] leading-snug text-gray-600 sm:text-xs">
                {current.disclosure_label ?? AI_IMAGE_DISCLOSURE}
              </p>
            )}
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center bg-gray-100 md:aspect-video">
            <Package className="h-16 w-16 text-gray-400" />
          </div>
        )}

        {/* Thumbnails */}
        {active.length > 1 && (
          <div className="flex gap-2 overflow-x-auto p-4">
            {active.map((image, thumbIndex) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setIndex(thumbIndex)}
                aria-label={`View image ${thumbIndex + 1}`}
                className={cn(
                  'relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                  thumbIndex === index
                    ? tab === 'ai'
                      ? 'border-indigo-600'
                      : 'border-emerald-600'
                    : 'border-gray-200'
                )}
              >
                {!failed.has(image.id) ? (
                  <Image
                    src={image.public_url}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="h-full w-full object-cover"
                    onError={() => markFailed(image.id)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                )}

                {tab === 'ai' && (
                  <span className="absolute inset-x-0 bottom-0 bg-indigo-600/85 py-[1px] text-center text-[8px] font-bold uppercase tracking-wide text-white">
                    AI
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Cross-reference so a buyer looking at mockups can get back to truth */}
        {tab === 'ai' && originals.length > 0 && (
          <div className="border-t border-gray-100 px-4 pb-4">
            <button
              type="button"
              onClick={() => switchTab('original')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <ShieldCheck className="h-4 w-4" />
              View the {originals.length} verified original photo
              {originals.length === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
