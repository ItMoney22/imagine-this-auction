'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  ClipboardCheck,
  ImagePlus,
  Loader2,
  Save,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'

import type { Auction, Json, Lot } from '@/lib/types/database'
import type { AiListingAssistantResponse } from '@/lib/ai/listing-assistant'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDollars } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type SuggestionFieldKey =
  | 'title'
  | 'description'
  | 'category'
  | 'condition_report'
  | 'provenance_suggestion'
  | 'estimate_low'
  | 'estimate_high'
  | 'keywords'
  | 'suggested_starting_bid'

interface LotFormProps {
  auction: Auction
  existingLots?: Lot[]
  aiEnabled?: boolean
}

interface AiSuggestionState {
  title: string
  description: string
  category: string
  condition_report: string
  provenance_suggestion: string
  estimate_low: string
  estimate_high: string
  keywords: string
  suggested_starting_bid: string
}

interface AiSuggestionBundle {
  values: AiSuggestionState
  metadata: Record<string, Json | undefined> | null
}

interface FormState {
  title: string
  description: string
  category: string
  conditionReport: string
  provenance: string
  estimateLow: string
  estimateHigh: string
  keywords: string
  startingBid: string
  increment: string
  reservePrice: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: '',
  conditionReport: '',
  provenance: '',
  estimateLow: '',
  estimateHigh: '',
  keywords: '',
  startingBid: '',
  increment: '25.00',
  reservePrice: '',
}

const MULTILINE_FIELDS = new Set<SuggestionFieldKey>([
  'description',
  'condition_report',
  'provenance_suggestion',
])

const FIELD_META: Array<{
  key: SuggestionFieldKey
  label: string
  hint?: string
}> = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'condition_report', label: 'Condition report' },
  { key: 'provenance_suggestion', label: 'Provenance suggestion' },
  { key: 'estimate_low', label: 'Estimate low', hint: 'USD' },
  { key: 'estimate_high', label: 'Estimate high', hint: 'USD' },
  { key: 'keywords', label: 'Keywords / tags' },
  { key: 'suggested_starting_bid', label: 'Suggested starting bid', hint: 'USD' },
]

function centsToInput(value: number | null | undefined) {
  if (value == null) {
    return ''
  }

  return (value / 100).toFixed(2)
}

function inputToCents(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Enter a valid non-negative USD amount')
  }

  return Math.round(parsed * 100)
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
}

function normalizeAiSuggestions(
  suggestion: AiListingAssistantResponse,
  metadata: Record<string, Json | undefined> | null
): AiSuggestionBundle {
  return {
    values: {
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      condition_report: suggestion.condition_report,
      provenance_suggestion: suggestion.provenance_suggestion,
      estimate_low: centsToInput(suggestion.estimate_low),
      estimate_high: centsToInput(suggestion.estimate_high),
      keywords: suggestion.keywords.join(', '),
      suggested_starting_bid: centsToInput(suggestion.suggested_starting_bid),
    },
    metadata,
  }
}

export function LotForm({
  auction,
  existingLots = [],
  aiEnabled = false,
}: LotFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [manualContext, setManualContext] = useState('')
  const [uploadingImages, setUploadingImages] = useState(false)
  const [savingLot, setSavingLot] = useState(false)
  const [runningAi, setRunningAi] = useState(false)
  const [runningConditionReport, setRunningConditionReport] = useState(false)
  const [arModelUrl, setArModelUrl] = useState<string>('')
  const [uploadingArModel, setUploadingArModel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionBundle | null>(null)
  const [editingFields, setEditingFields] = useState<
    Partial<Record<SuggestionFieldKey, boolean>>
  >({})
  const [acceptedFields, setAcceptedFields] = useState<
    Partial<Record<SuggestionFieldKey, boolean>>
  >({})

  const nextLotNumber = useMemo(() => {
    const highest = existingLots.reduce(
      (currentHighest, lot) => Math.max(currentHighest, lot.lot_number),
      0
    )

    return highest + 1
  }, [existingLots])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setImageUrls([])
    setManualContext('')
    setAiSuggestions(null)
    setEditingFields({})
    setAcceptedFields({})
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    setUploadingImages(true)
    setError(null)
    setSuccess(null)

    try {
      const uploadedUrls: string[] = []

      for (const file of files) {
        const path = [
          auction.id,
          `${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(file.name)}`,
        ].join('/')

        const { error: uploadError } = await supabase.storage
          .from('lot-images')
          .upload(path, file, {
            cacheControl: '3600',
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage.from('lot-images').getPublicUrl(path)
        uploadedUrls.push(data.publicUrl)
      }

      setImageUrls((current) => [...current, ...uploadedUrls])
      setSuccess(`${uploadedUrls.length} image${uploadedUrls.length === 1 ? '' : 's'} uploaded`)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload one or more images'
      )
    } finally {
      event.target.value = ''
      setUploadingImages(false)
    }
  }

  const removeImage = (urlToRemove: string) => {
    setImageUrls((current) => current.filter((url) => url !== urlToRemove))
  }

  const handleArModelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!/\.usdz$/i.test(file.name)) {
      setError('AR model must be a .usdz file (used by iOS Quick Look)')
      event.target.value = ''
      return
    }
    setUploadingArModel(true)
    setError(null)
    try {
      const path = `${auction.id}/${Date.now()}-${sanitizeFilename(file.name)}`
      const { error: upErr } = await supabase.storage
        .from('ar-models')
        .upload(path, file, { contentType: 'model/vnd.usdz+zip', upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('ar-models').getPublicUrl(path)
      setArModelUrl(data.publicUrl)
      setSuccess('AR model uploaded')
    } catch (e: any) {
      setError(e.message ?? 'Failed to upload AR model')
    } finally {
      event.target.value = ''
      setUploadingArModel(false)
    }
  }

  const removeArModel = () => setArModelUrl('')

  const updateSuggestionField = (key: SuggestionFieldKey, value: string) => {
    setAiSuggestions((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        values: {
          ...current.values,
          [key]: value,
        },
      }
    })
  }

  const applySuggestion = (key: SuggestionFieldKey) => {
    if (!aiSuggestions) {
      return
    }

    const value = aiSuggestions.values[key]

    setForm((current) => {
      switch (key) {
        case 'title':
          return { ...current, title: value }
        case 'description':
          return { ...current, description: value }
        case 'category':
          return { ...current, category: value }
        case 'condition_report':
          return { ...current, conditionReport: value }
        case 'provenance_suggestion':
          return { ...current, provenance: value }
        case 'estimate_low':
          return { ...current, estimateLow: value }
        case 'estimate_high':
          return { ...current, estimateHigh: value }
        case 'keywords':
          return { ...current, keywords: value }
        case 'suggested_starting_bid':
          return { ...current, startingBid: value }
        default:
          return current
      }
    })

    setAcceptedFields((current) => ({ ...current, [key]: true }))
    setEditingFields((current) => ({ ...current, [key]: false }))
  }

  const applyAllSuggestions = () => {
    FIELD_META.forEach(({ key }) => {
      applySuggestion(key)
    })
  }

  const runAiAssistant = async () => {
    if (imageUrls.length === 0 || runningAi || !aiEnabled) {
      return
    }

    setRunningAi(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/ai/listing-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrls,
          manualContext: manualContext.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as
        | (AiListingAssistantResponse & {
            metadata?: Record<string, Json | undefined> | null
            error?: never
          })
        | { error?: string }

      if (!response.ok) {
        throw new Error(payload.error || 'AI assistant request failed')
      }

      const suggestionBundle = normalizeAiSuggestions(
        payload as AiListingAssistantResponse,
        'metadata' in payload ? payload.metadata ?? null : null
      )

      setAiSuggestions(suggestionBundle)
      setEditingFields({})
      setAcceptedFields({})
      setSuccess('AI suggestions are ready for review')
    } catch (assistantError) {
      setError(
        assistantError instanceof Error
          ? assistantError.message
          : 'Failed to generate AI suggestions'
      )
    } finally {
      setRunningAi(false)
    }
  }

  const runConditionReport = async () => {
    if (imageUrls.length === 0 || runningConditionReport) return
    setRunningConditionReport(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/ai/condition-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_urls: imageUrls,
          title: form.title || undefined,
          description: form.description || undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Condition report failed')
      const r = payload.report
      const formatted = [
        `Overall: ${r.overall_grade ?? 'n/a'}`,
        r.summary ? `\nSummary: ${r.summary}` : '',
        r.highlights?.length ? `\nHighlights:\n  - ${r.highlights.join('\n  - ')}` : '',
        r.wear_and_flaws?.length ? `\nWear & flaws:\n  - ${r.wear_and_flaws.join('\n  - ')}` : '',
        r.dimensions_estimate ? `\nDimensions: ${r.dimensions_estimate}` : '',
        r.materials?.length ? `\nMaterials: ${r.materials.join(', ')}` : '',
        r.era_estimate ? `\nEra: ${r.era_estimate}` : '',
        r.authenticity_notes?.length ? `\nAuthenticity:\n  - ${r.authenticity_notes.join('\n  - ')}` : '',
        r.recommended_inspection?.length ? `\nVerify in person:\n  - ${r.recommended_inspection.join('\n  - ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      setForm((current) => ({ ...current, conditionReport: formatted.trim() }))
      setSuccess('Condition report generated and inserted below.')
    } catch (e: any) {
      setError(e.message ?? 'Condition report failed')
    } finally {
      setRunningConditionReport(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingLot(true)
    setError(null)
    setSuccess(null)

    try {
      if (imageUrls.length === 0) {
        throw new Error('Upload at least one image before saving this lot')
      }

      const startingBid = inputToCents(form.startingBid)
      const increment = inputToCents(form.increment)
      const reservePrice = inputToCents(form.reservePrice)
      const estimateLow = inputToCents(form.estimateLow)
      const estimateHigh = inputToCents(form.estimateHigh)

      if (!form.title.trim()) {
        throw new Error('Title is required')
      }

      if (!form.description.trim()) {
        throw new Error('Description is required')
      }

      if (startingBid == null || startingBid <= 0) {
        throw new Error('Starting bid must be greater than $0.00')
      }

      if (increment == null || increment <= 0) {
        throw new Error('Bid increment must be greater than $0.00')
      }

      if (
        estimateLow != null &&
        estimateHigh != null &&
        estimateHigh < estimateLow
      ) {
        throw new Error('Estimate high must be greater than or equal to estimate low')
      }

      const { data: latestLot, error: lotLookupError } = await supabase
        .from('lots')
        .select('lot_number')
        .eq('auction_id', auction.id)
        .order('lot_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lotLookupError) {
        throw lotLookupError
      }

      const acceptedFieldNames = Object.entries(acceptedFields)
        .filter(([, accepted]) => accepted)
        .map(([field]) => field)

      const keywordList = form.keywords
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean)

      const aiMetadata =
        aiSuggestions || keywordList.length > 0
          ? ({
              source: aiSuggestions ? 'listing-assistant' : 'manual',
              model: aiSuggestions?.metadata?.model ?? null,
              generated_at: aiSuggestions?.metadata?.generated_at ?? null,
              accepted_fields: acceptedFieldNames,
              keywords: keywordList,
              manual_context: manualContext.trim() || null,
              image_count: imageUrls.length,
            } satisfies Json)
          : null

      const lotPayload = {
        auction_id: auction.id,
        lot_number: (latestLot?.lot_number ?? 0) + 1,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim() || null,
        condition_report: form.conditionReport.trim() || null,
        provenance: form.provenance.trim() || null,
        estimate_low: estimateLow,
        estimate_high: estimateHigh,
        starting_bid: startingBid,
        increment,
        reserve_price: reservePrice,
        images: imageUrls,
        ar_model_url: arModelUrl || null,
        ai_generated: acceptedFieldNames.length > 0,
        ai_metadata: aiMetadata,
      }

      const { error: insertError } = await supabase.from('lots').insert(lotPayload)

      if (insertError) {
        throw insertError
      }

      setSuccess(`Lot ${lotPayload.lot_number} created successfully`)
      resetForm()
      router.refresh()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to save lot'
      )
    } finally {
      setSavingLot(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="border-indigo-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(76,29,149,0.14),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,240,255,0.94))]">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] text-white">
                  Lot Workspace
                </Badge>
                <Badge variant="secondary">Next lot #{nextLotNumber}</Badge>
              </div>
              <CardTitle className="font-display text-3xl">
                Create a Catalog-Ready Lot
              </CardTitle>
              <CardDescription>
                Upload images, optionally run AI analysis, then publish the fields you
                actually approve.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <section className="space-y-4 rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">Images & AI assist</h2>
                  <p className="text-sm text-slate-500">
                    Images are uploaded to Supabase Storage first, then passed to the AI
                    assistant by public URL.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={runAiAssistant}
                    disabled={!aiEnabled || imageUrls.length === 0 || runningAi}
                    className="btn-glow"
                  >
                    {runningAi ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {runningAi ? 'Analyzing your item...' : 'AI Assist'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={runConditionReport}
                    disabled={imageUrls.length === 0 || runningConditionReport}
                  >
                    {runningConditionReport ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                    )}
                    {runningConditionReport ? 'Inspecting...' : 'Generate condition report'}
                  </Button>
                </div>
              </div>

              {!aiEnabled ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  AI assistant is currently disabled for this auctioneer account. Enable it
                  in `/org/settings` before requesting suggestions.
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="lot-images">Upload lot images</Label>
                  <Input
                    id="lot-images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    disabled={uploadingImages || savingLot}
                  />
                  <p className="text-xs text-slate-500">
                    JPG, PNG, or WebP. Upload multiple angles for better catalog copy.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manual-context">Manual context for AI (optional)</Label>
                  <Textarea
                    id="manual-context"
                    value={manualContext}
                    onChange={(event) => setManualContext(event.target.value.slice(0, 1000))}
                    placeholder="Example: Marked sterling on underside, approximately 8 inches tall, estate fresh."
                    rows={4}
                  />
                </div>
              </div>

              {uploadingImages ? (
                <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-r from-[#ede9fe] via-[#ddd6fe] to-[#ede9fe] p-4 text-sm text-indigo-950">
                  <div className="animate-shimmer rounded-xl px-4 py-6">
                    Uploading images to `lot-images`...
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {imageUrls.map((url) => (
                  <div
                    key={url}
                    className="group overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-sm"
                  >
                    <div className="relative aspect-[4/3] bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Uploaded lot"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute right-3 top-3 rounded-full bg-slate-950/70 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
                        aria-label="Remove uploaded image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="truncate px-3 py-2 text-xs text-slate-500">{url}</div>
                  </div>
                ))}

                {imageUrls.length === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-6 text-center text-sm text-slate-500">
                    <ImagePlus className="mb-3 h-8 w-8 text-indigo-500" />
                    Upload photos to unlock AI-assisted cataloging.
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <Label htmlFor="ar-model">AR model (.usdz, optional)</Label>
                <p className="text-xs text-slate-500">
                  Upload a USDZ file for "View in your room" AR preview on iOS. Buyers tap the AR
                  button on the lot detail page to see the item life-size in their space.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    id="ar-model"
                    type="file"
                    accept=".usdz,model/vnd.usdz+zip"
                    onChange={handleArModelUpload}
                    disabled={uploadingArModel || savingLot}
                    className="max-w-sm"
                  />
                  {uploadingArModel && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
                </div>
                {arModelUrl && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <Check className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate flex-1">{arModelUrl}</span>
                    <button
                      type="button"
                      onClick={removeArModel}
                      className="text-emerald-700 hover:text-emerald-900"
                      aria-label="Remove AR model"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Example: Mid-Century Walnut Credenza"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="Furniture, Fine Art, Decorative Arts..."
                />
              </div>
            </section>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Write the approved catalog description for this lot."
                rows={6}
              />
            </div>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="condition-report">Condition report</Label>
                <Textarea
                  id="condition-report"
                  value={form.conditionReport}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      conditionReport: event.target.value,
                    }))
                  }
                  placeholder="Visible wear, losses, repairs, or areas requiring inspection."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provenance">Provenance / attribution notes</Label>
                <Textarea
                  id="provenance"
                  value={form.provenance}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, provenance: event.target.value }))
                  }
                  placeholder="Document visible signatures, labels, maker marks, or ownership clues."
                  rows={4}
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="starting-bid">Starting bid (USD)</Label>
                <Input
                  id="starting-bid"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.startingBid}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startingBid: event.target.value }))
                  }
                  placeholder="25.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="increment">Bid increment (USD)</Label>
                <Input
                  id="increment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.increment}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, increment: event.target.value }))
                  }
                  placeholder="25.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reserve-price">Reserve price (USD)</Label>
                <Input
                  id="reserve-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reservePrice}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reservePrice: event.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimate-low">Estimate low (USD)</Label>
                <Input
                  id="estimate-low"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimateLow}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, estimateLow: event.target.value }))
                  }
                  placeholder="250.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimate-high">Estimate high (USD)</Label>
                <Input
                  id="estimate-high"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimateHigh}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, estimateHigh: event.target.value }))
                  }
                  placeholder="400.00"
                />
              </div>
            </section>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords / tags</Label>
              <Textarea
                id="keywords"
                value={form.keywords}
                onChange={(event) =>
                  setForm((current) => ({ ...current, keywords: event.target.value }))
                }
                placeholder="comma-separated tags for search and internal reference"
                rows={3}
              />
              <p className="text-xs text-slate-500">
                Saved into `lots.ai_metadata.keywords` because the current schema does not
                include a dedicated keyword column.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-white/60 pt-4">
              <Button type="button" variant="outline" onClick={resetForm} disabled={savingLot}>
                Reset
              </Button>
              <Button type="submit" disabled={savingLot || uploadingImages}>
                {savingLot ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {savingLot ? 'Saving lot...' : 'Create Lot'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit border-indigo-200/70 bg-[linear-gradient(180deg,rgba(76,29,149,0.95),rgba(49,46,129,0.94))] text-white shadow-[0_30px_70px_rgba(49,46,129,0.35)]">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Badge className="w-fit gap-1 bg-white/15 text-white backdrop-blur">
                <WandSparkles className="h-3.5 w-3.5" />
                AI Suggestions
              </Badge>
              <CardTitle className="text-2xl text-white">Review Before You Apply</CardTitle>
              <CardDescription className="text-indigo-100/80">
                Suggestions stay separate until you accept them.
              </CardDescription>
            </div>
            {aiSuggestions ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="bg-white text-indigo-950 hover:bg-indigo-50"
                onClick={applyAllSuggestions}
              >
                <Check className="mr-2 h-4 w-4" />
                Accept All
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {runningAi ? (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-4">
              <div className="animate-shimmer rounded-2xl border border-white/10 bg-gradient-to-r from-white/10 via-white/20 to-white/10 px-4 py-8 text-sm text-white">
                Analyzing your item...
              </div>
            </div>
          ) : null}

          {!runningAi && !aiSuggestions ? (
            <div className="rounded-3xl border border-dashed border-white/20 bg-white/8 p-5 text-sm text-indigo-100/80">
              Upload photos, then run AI Assist to generate a premium draft title,
              catalog copy, category, condition notes, provenance hints, estimates, and
              search keywords.
            </div>
          ) : null}

          {!runningAi && aiSuggestions
            ? FIELD_META.map(({ key, label, hint }) => {
                const value = aiSuggestions.values[key]
                const isEditing = editingFields[key] ?? false
                const accepted = acceptedFields[key] ?? false
                const isTextarea = MULTILINE_FIELDS.has(key)
                const isKeywords = key === 'keywords'
                const helperValue =
                  key === 'estimate_low' ||
                  key === 'estimate_high' ||
                  key === 'suggested_starting_bid'
                    ? value
                      ? formatDollars(inputToCents(value))
                      : 'No value'
                    : null

                return (
                  <div
                    key={key}
                    className="space-y-3 rounded-3xl border border-white/10 bg-white/10 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{label}</h3>
                          {hint ? (
                            <Badge className="bg-white/10 text-[10px] text-white">
                              {hint}
                            </Badge>
                          ) : null}
                          {accepted ? (
                            <Badge className="bg-emerald-500/20 text-emerald-100">
                              Accepted
                            </Badge>
                          ) : null}
                        </div>
                        {helperValue ? (
                          <p className="text-xs text-indigo-100/70">{helperValue}</p>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                          onClick={() =>
                            setEditingFields((current) => ({
                              ...current,
                              [key]: !isEditing,
                            }))
                          }
                        >
                          {isEditing ? 'Preview' : 'Edit'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className={cn(
                            accepted
                              ? 'bg-emerald-500 text-white hover:brightness-105'
                              : 'bg-white text-indigo-950 hover:bg-indigo-50'
                          )}
                          onClick={() => applySuggestion(key)}
                        >
                          {accepted ? 'Applied' : 'Accept'}
                        </Button>
                      </div>
                    </div>

                    {isEditing ? (
                      isTextarea || isKeywords ? (
                        <Textarea
                          value={value}
                          onChange={(event) => updateSuggestionField(key, event.target.value)}
                          rows={isKeywords ? 3 : 5}
                          className="border-white/15 bg-white text-slate-900"
                        />
                      ) : (
                        <Input
                          value={value}
                          onChange={(event) => updateSuggestionField(key, event.target.value)}
                          className="border-white/15 bg-white text-slate-900"
                        />
                      )
                    ) : isKeywords ? (
                      <div className="flex flex-wrap gap-2">
                        {value
                          .split(',')
                          .map((keyword) => keyword.trim())
                          .filter(Boolean)
                          .map((keyword) => (
                            <Badge
                              key={keyword}
                              className="bg-white/12 text-white shadow-none"
                            >
                              {keyword}
                            </Badge>
                          ))}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-indigo-50/95">
                        {value || 'No suggestion returned.'}
                      </p>
                    )}
                  </div>
                )
              })
            : null}
        </CardContent>
      </Card>
    </div>
  )
}
