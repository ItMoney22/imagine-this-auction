'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Info, Palette, ShieldCheck, Sparkles, Wand2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreditCostButton } from '@/components/org/quick-list/credit-cost-button'
import { cn } from '@/lib/utils'
import { generateIdempotencyKey } from '@/lib/ai/quick-listing'
import {
  AI_ENHANCED_LABEL,
  AI_IMAGE_DISCLOSURE,
  IMAGE_VARIANTS,
  IMAGE_VARIANT_ACTION,
  IMAGE_VARIANT_DESCRIPTION,
  IMAGE_VARIANT_LABEL,
  VERIFIED_ORIGINALS_LABEL,
  type ImageVariant,
} from '@/lib/ai/quick-listing'
import { generatePresentationImage } from '@/lib/ai/quick-list-client'

interface StoredImage {
  id: string
  public_url: string
  kind: 'original' | 'ai_generated'
  variant?: ImageVariant | null
  disclosure_label?: string | null
}

interface AiImageStudioProps {
  draftId?: string
  lotId?: string
  originalImages: StoredImage[]
  generatedImages: StoredImage[]
  priceFor: (actionKey: string) => number
  availableCredits: number
  imageGenerationAvailable: boolean
  onGenerated: (image: StoredImage, charged: number, balanceAfter?: number) => void
  onError: (message: string) => void
}

const VARIANT_ICON: Record<ImageVariant, React.ReactNode> = {
  cleanup: <Wand2 className="h-4 w-4" />,
  studio: <Palette className="h-4 w-4" />,
  lifestyle: <Sparkles className="h-4 w-4" />,
}

/**
 * Buy presentation images with ITC credits.
 *
 * Generation always starts from a selected *verified original*, and the result
 * is filed under AI-Enhanced with its disclosure — it never replaces the
 * original as the item's evidence.
 */
export function AiImageStudio({
  draftId,
  lotId,
  originalImages,
  generatedImages,
  priceFor,
  availableCredits,
  imageGenerationAvailable,
  onGenerated,
  onError,
}: AiImageStudioProps) {
  const [sourceId, setSourceId] = useState<string | null>(originalImages[0]?.id ?? null)
  const [sceneHint, setSceneHint] = useState('')
  const [busyVariant, setBusyVariant] = useState<ImageVariant | null>(null)

  const activeSourceId = sourceId ?? originalImages[0]?.id ?? null

  const run = async (variant: ImageVariant) => {
    if (!activeSourceId) {
      onError('Add at least one photo before generating presentation images.')
      return
    }

    setBusyVariant(variant)

    try {
      const response = await generatePresentationImage({
        idempotency_key: generateIdempotencyKey(`img:${variant}`),
        variant,
        source_image_id: activeSourceId,
        draft_id: draftId,
        lot_id: lotId,
        scene_hint: variant === 'lifestyle' && sceneHint.trim() ? sceneHint.trim() : undefined,
      })

      if (response.image) {
        onGenerated(response.image as StoredImage, response.charged, response.balance_after)
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Image generation failed')
    } finally {
      setBusyVariant(null)
    }
  }

  if (originalImages.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Add item photos first — presentation images are always generated from a verified original.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Integrity notice */}
      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-snug text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          Presentation images change the background and lighting only. Defects, accessories,
          branding, quantity and condition are never altered, and your {VERIFIED_ORIGINALS_LABEL.toLowerCase()}{' '}
          always show first to buyers.
        </p>
      </div>

      {!imageGenerationAvailable && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          Image generation is not configured on this environment yet. The buttons below stay
          disabled until an image provider key is set.
        </p>
      )}

      {/* Source picker */}
      <div className="space-y-2">
        <Label>Source photo</Label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {originalImages.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSourceId(image.id)}
              aria-pressed={activeSourceId === image.id}
              className={cn(
                'relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 transition',
                activeSourceId === image.id
                  ? 'border-emerald-600 ring-2 ring-emerald-200'
                  : 'border-slate-200 hover:border-emerald-300'
              )}
            >
              <Image
                src={image.public_url}
                alt={`Original ${index + 1}`}
                fill
                unoptimized
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Variant buttons */}
      <div className="grid gap-3 sm:grid-cols-3">
        {IMAGE_VARIANTS.map((variant) => (
          <div key={variant} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {VARIANT_ICON[variant]}
              {IMAGE_VARIANT_LABEL[variant]}
            </div>

            {variant === 'lifestyle' && (
              <Input
                value={sceneHint}
                onChange={(event) => setSceneHint(event.target.value)}
                placeholder="Setting, e.g. 'on a walnut desk'"
                maxLength={240}
                className="h-8 text-xs"
              />
            )}

            <CreditCostButton
              label="Generate"
              creditCost={priceFor(IMAGE_VARIANT_ACTION[variant])}
              availableCredits={availableCredits}
              loading={busyVariant === variant}
              loadingLabel="Generating…"
              disabled={busyVariant !== null || !imageGenerationAvailable || !activeSourceId}
              onConfirm={() => run(variant)}
              description={IMAGE_VARIANT_DESCRIPTION[variant]}
              variant="outline"
              icon={VARIANT_ICON[variant]}
            />
          </div>
        ))}
      </div>

      {/* Results */}
      {generatedImages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-indigo-600 text-white">
              <Sparkles className="mr-1 h-3 w-3" />
              {AI_ENHANCED_LABEL}
            </Badge>
            <span className="text-xs text-slate-500">{generatedImages.length} generated</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {generatedImages.map((image) => (
              <figure
                key={image.id}
                className="overflow-hidden rounded-2xl border border-indigo-200 bg-white"
              >
                <div className="relative aspect-square bg-slate-100">
                  <Image
                    src={image.public_url}
                    alt="AI-generated presentation image"
                    fill
                    unoptimized
                    sizes="200px"
                    className="object-cover"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-indigo-600/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    AI
                  </span>
                </div>
                <figcaption className="space-y-1 p-2">
                  {image.variant && (
                    <p className="text-[11px] font-semibold text-slate-700">
                      {IMAGE_VARIANT_LABEL[image.variant]}
                    </p>
                  )}
                  <p className="flex items-start gap-1 text-[10px] leading-snug text-slate-500">
                    <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    {image.disclosure_label ?? AI_IMAGE_DISCLOSURE}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
