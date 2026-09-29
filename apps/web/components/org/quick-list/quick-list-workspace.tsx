'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  Coins,
  Layers,
  RotateCcw,
  ScanBarcode,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatITC } from '@/lib/utils'
import {
  CandidateSchema,
  generateIdempotencyKey,
  needsCandidateSelection,
  resolvedDraftValues,
  type DraftSuggestion,
  type ListingCandidate,
} from '@/lib/ai/quick-listing'
import {
  approveDraft,
  discardDraft,
  fetchDraft,
  fetchDrafts,
  fetchPricing,
  generateDraft,
  identifyItem,
  patchDraft,
  QuickListApiError,
  uploadOriginalPhotos,
  type PricingResponse,
} from '@/lib/ai/quick-list-client'
import { AiImageStudio } from '@/components/org/quick-list/ai-image-studio'
import { BatchQueue, type QueueDraft } from '@/components/org/quick-list/batch-queue'
import { CandidatePicker } from '@/components/org/quick-list/candidate-picker'
import { CreditCostButton } from '@/components/org/quick-list/credit-cost-button'
import {
  DraftReview,
  inputToCents,
  reviewValuesFromDraft,
  type ReviewValues,
} from '@/components/org/quick-list/draft-review'
import { ScannerPanel, type CapturedPhoto } from '@/components/org/quick-list/scanner-panel'

interface AuctionOption {
  id: string
  title: string
  status: string
  ends_at: string
}

interface QuickListWorkspaceProps {
  initialContext?: string
  auctioneerId: string
  auctions: AuctionOption[]
  initialDrafts: QueueDraft[]
  defaultAuctionId?: string
}

type Step = 'capture' | 'select' | 'review'

interface StoredImage {
  id: string
  public_url: string
  kind: 'original' | 'ai_generated'
  variant?: any
  disclosure_label?: string | null
}

export function QuickListWorkspace({
  auctioneerId,
  auctions,
  initialDrafts,
  initialContext = '',
  defaultAuctionId,
}: QuickListWorkspaceProps) {
  const router = useRouter()

  // --- capture state ---
  const [scanValue, setScanValue] = useState('')
  const [photos, setPhotos] = useState<CapturedPhoto[]>([])
  const [manualContext, setManualContext] = useState(initialContext)

  // --- draft state ---
  const [step, setStep] = useState<Step>('capture')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ListingCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null)
  const [requiresSelection, setRequiresSelection] = useState(false)
  const [reviewValues, setReviewValues] = useState<ReviewValues | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [confidenceReasons, setConfidenceReasons] = useState<string[]>([])
  const [attributes, setAttributes] = useState<Record<string, string>>({})
  const [moderationWarnings, setModerationWarnings] = useState<string[]>([])
  const [originalImages, setOriginalImages] = useState<StoredImage[]>([])
  const [generatedImages, setGeneratedImages] = useState<StoredImage[]>([])
  const [selectedAuctionId, setSelectedAuctionId] = useState(defaultAuctionId ?? '')
  const [includeAiImages, setIncludeAiImages] = useState(true)

  // --- shared state ---
  const [pricing, setPricing] = useState<PricingResponse | null>(null)
  const [queue, setQueue] = useState<QueueDraft[]>(initialDrafts)
  const [busy, setBusy] = useState<null | 'identify' | 'draft' | 'save' | 'publish'>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const photoUrlsRef = useRef<string[]>([])

  useEffect(() => {
    // Revoke object URLs on unmount so long batch sessions don't leak memory.
    const urls = photoUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const refreshPricing = useCallback(async () => {
    try {
      setPricing(await fetchPricing())
    } catch (pricingError) {
      console.error('[quick-list] pricing load failed', pricingError)
    }
  }, [])

  useEffect(() => {
    void refreshPricing()
  }, [refreshPricing])

  const refreshQueue = useCallback(async () => {
    try {
      const { drafts } = await fetchDrafts()
      setQueue(drafts as QueueDraft[])
    } catch (queueError) {
      console.error('[quick-list] queue load failed', queueError)
    }
  }, [])

  const priceFor = useCallback(
    (actionKey: string) =>
      pricing?.prices.find((price) => price.action_key === actionKey)?.credit_cost ?? 0,
    [pricing]
  )

  const availableCredits = pricing?.available_credits ?? 0

  const handleError = (nextError: unknown) => {
    if (nextError instanceof QuickListApiError) {
      setError(nextError.message)
      if (nextError.code === 'insufficient_credits') {
        void refreshPricing()
      }
    } else {
      setError(nextError instanceof Error ? nextError.message : 'Something went wrong')
    }
  }

  // ============================================================
  // Capture
  // ============================================================

  const addPhotos = (files: File[]) => {
    setError(null)

    const additions = files.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      photoUrlsRef.current.push(previewUrl)

      return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, previewUrl }
    })

    setPhotos((current) => [...current, ...additions].slice(0, 8))
  }

  const removePhoto = (id: string) => {
    setPhotos((current) => current.filter((photo) => photo.id !== id))
  }

  const resetCapture = () => {
    setScanValue('')
    setPhotos([])
    setManualContext('')
    setStep('capture')
    setDraftId(null)
    setCandidates([])
    setSelectedCandidate(null)
    setRequiresSelection(false)
    setReviewValues(null)
    setConfidence(null)
    setConfidenceReasons([])
    setAttributes({})
    setModerationWarnings([])
    setOriginalImages([])
    setGeneratedImages([])
    setError(null)
    setNotice(null)
  }

  // ============================================================
  // Step 1 — identify
  // ============================================================

  const runIdentify = async () => {
    if (!scanValue.trim() && photos.length === 0) {
      setError('Scan a code or add at least one photo first.')
      return
    }

    setBusy('identify')
    setError(null)
    setNotice(null)

    try {
      setUploading(photos.length > 0)
      const uploaded =
        photos.length > 0 ? await uploadOriginalPhotos(auctioneerId, photos.map((p) => p.file)) : []
      setUploading(false)

      const response = await identifyItem({
        idempotency_key: generateIdempotencyKey('identify'),
        auction_id: selectedAuctionId || undefined,
        scan_value: scanValue.trim() || undefined,
        manual_context: manualContext.trim() || undefined,
        images: uploaded,
      })

      if (response.draft_id) setDraftId(response.draft_id)

      const parsedCandidates = (response.candidates ?? [])
        .map((candidate) => CandidateSchema.safeParse(candidate))
        .filter((result): result is { success: true; data: ListingCandidate } => result.success)
        .map((result) => result.data)

      setCandidates(parsedCandidates)

      if (parsedCandidates.length === 0) {
        setError(
          response.error ??
            'No match found. Add clearer photos of the item, its label or its markings.'
        )
        setBusy(null)
        await refreshPricing()
        return
      }

      const mustSelect = response.requires_selection ?? needsCandidateSelection(parsedCandidates)
      setRequiresSelection(mustSelect)
      setSelectedCandidate(mustSelect ? null : 0)
      setStep('select')

      if (response.moderation?.status === 'flagged') {
        setModerationWarnings(response.moderation.reasons ?? [])
      }

      setNotice(
        response.charged > 0
          ? `Identified — ${formatITC(response.charged)} used.`
          : 'Identified at no charge.'
      )

      await Promise.all([refreshPricing(), refreshQueue()])
    } catch (identifyError) {
      handleError(identifyError)
      setUploading(false)
    } finally {
      setBusy(null)
    }
  }

  // ============================================================
  // Step 2 — generate the draft
  // ============================================================

  const loadDraftState = useCallback(async (id: string) => {
    const detail = await fetchDraft(id)
    const draft = detail.draft

    const values = resolvedDraftValues(
      draft as unknown as { suggested: Partial<DraftSuggestion>; edits: Record<string, unknown> }
    )

    setDraftId(id)
    setReviewValues(
      reviewValuesFromDraft(values, {
        reservePrice: '',
        increment: '25.00',
      })
    )
    setConfidence(draft.confidence ?? null)
    setConfidenceReasons(draft.confidence_reasons ?? [])
    setAttributes((values.attributes as Record<string, string>) ?? {})
    setOriginalImages(detail.original_images as StoredImage[])
    setGeneratedImages(detail.generated_images as StoredImage[])
    setSelectedAuctionId((current) => draft.auction_id ?? current)

    const parsedCandidates = (draft.candidates ?? [])
      .map((candidate: unknown) => CandidateSchema.safeParse(candidate))
      .filter((result: any): result is { success: true; data: ListingCandidate } => result.success)
      .map((result: any) => result.data)

    setCandidates(parsedCandidates)
    setSelectedCandidate(draft.selected_candidate_index ?? null)

    const moderation = draft.moderation_result as { reasons?: string[] } | null
    setModerationWarnings(
      draft.moderation_status === 'flagged' ? (moderation?.reasons ?? []) : []
    )

    return draft
  }, [])

  const runGenerateDraft = async () => {
    if (!draftId) return

    if (requiresSelection && selectedCandidate == null) {
      setError('Select which match is correct first.')
      return
    }

    setBusy('draft')
    setError(null)
    setNotice(null)

    try {
      const response = await generateDraft(draftId, {
        idempotency_key: generateIdempotencyKey('draft'),
        candidate_index: selectedCandidate,
        manual_context: manualContext.trim() || undefined,
      })

      await loadDraftState(draftId)
      setStep('review')

      if (response.moderation?.status === 'flagged') {
        setModerationWarnings(response.moderation.reasons ?? [])
      }

      setNotice(
        response.charged > 0
          ? `Draft ready — ${formatITC(response.charged)} used.`
          : 'Draft ready.'
      )

      await Promise.all([refreshPricing(), refreshQueue()])
    } catch (draftError) {
      handleError(draftError)
    } finally {
      setBusy(null)
    }
  }

  // ============================================================
  // Step 3 — edit, approve
  // ============================================================

  const collectEdits = (values: ReviewValues) => ({
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category.trim() || undefined,
    brand: values.brand.trim() || null,
    model: values.model.trim() || null,
    condition_notes: values.conditionNotes.trim(),
    condition_grade: values.conditionGrade,
    keywords: values.keywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 15),
    suggested_starting_bid: inputToCents(values.startingBid) ?? undefined,
    estimate_low: inputToCents(values.estimateLow),
    estimate_high: inputToCents(values.estimateHigh),
    suggested_duration_hours: values.durationHours,
  })

  const saveDraft = async () => {
    if (!draftId || !reviewValues) return

    setBusy('save')
    setError(null)

    try {
      await patchDraft(draftId, {
        ...collectEdits(reviewValues),
        auction_id: selectedAuctionId || null,
        selected_candidate_index: selectedCandidate,
      })

      setNotice('Draft saved.')
      await refreshQueue()
    } catch (saveError) {
      handleError(saveError)
    } finally {
      setBusy(null)
    }
  }

  const publishDraft = async () => {
    if (!draftId || !reviewValues || !selectedAuctionId) return

    setBusy('publish')
    setError(null)

    try {
      // Persist the latest edits first — approval publishes what is stored.
      await patchDraft(draftId, {
        ...collectEdits(reviewValues),
        auction_id: selectedAuctionId,
        selected_candidate_index: selectedCandidate,
      })

      const result = await approveDraft(draftId, {
        auction_id: selectedAuctionId,
        reserve_price: inputToCents(reviewValues.reservePrice),
        increment: inputToCents(reviewValues.increment) ?? 2500,
        include_ai_images: includeAiImages,
        confirmed_reviewed: true,
      })

      setNotice(
        `Lot ${result.lot_number} published with ${result.original_image_count} verified original photo${
          result.original_image_count === 1 ? '' : 's'
        }.`
      )

      // Batch flow: clear the bench, keep the queue, scan the next item.
      resetCapture()
      setSelectedAuctionId(selectedAuctionId)
      await refreshQueue()
      router.refresh()
    } catch (publishError) {
      handleError(publishError)
    } finally {
      setBusy(null)
    }
  }

  const removeDraft = async () => {
    if (!draftId) return

    setError(null)

    try {
      await discardDraft(draftId)
      resetCapture()
      await refreshQueue()
      setNotice('Draft discarded.')
    } catch (discardError) {
      handleError(discardError)
    }
  }

  const openQueueDraft = async (id: string) => {
    setError(null)
    setNotice(null)

    try {
      const draft = await loadDraftState(id)
      setStep(draft.status === 'needs_selection' ? 'select' : 'review')
      setRequiresSelection(draft.status === 'needs_selection')
    } catch (openError) {
      handleError(openError)
    }
  }

  const pendingCount = useMemo(
    () => queue.filter((draft) => draft.status === 'draft_ready' || draft.status === 'needs_selection').length,
    [queue]
  )

  const identifyCost = priceFor('quick_list_identify')
  const draftCost = priceFor('quick_list_draft')

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {/* Alerts */}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {notice && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 1 — capture */}
        {step === 'capture' && (
          <Card className="border-indigo-200/70">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] text-white">
                  Step 1
                </Badge>
                <Badge variant="secondary">Scan or photograph</Badge>
              </div>
              <CardTitle className="font-display text-2xl sm:text-3xl">Quick List Item</CardTitle>
              <CardDescription>
                Scan a barcode or take photos. We identify the item and build a draft listing you
                review before anything goes live.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <ScannerPanel
                scanValue={scanValue}
                onScanValueChange={setScanValue}
                photos={photos}
                onAddPhotos={addPhotos}
                onRemovePhoto={removePhoto}
                manualContext={manualContext}
                onManualContextChange={setManualContext}
                disabled={busy !== null}
                uploading={uploading}
              />

              <CreditCostButton
                label="Identify this item"
                creditCost={identifyCost}
                availableCredits={availableCredits}
                loading={busy === 'identify'}
                loadingLabel={uploading ? 'Uploading photos…' : 'Identifying…'}
                disabled={busy !== null || (!scanValue.trim() && photos.length === 0)}
                onConfirm={runIdentify}
                icon={<ScanBarcode className="h-4 w-4" />}
                description="Credits are only deducted if we identify the item."
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2 — candidates */}
        {step === 'select' && (
          <Card className="border-indigo-200/70">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] text-white">
                  Step 2
                </Badge>
                <Badge variant="secondary">Confirm the match</Badge>
              </div>
              <CardTitle className="font-display text-2xl">What did we find?</CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <CandidatePicker
                candidates={candidates}
                selectedIndex={selectedCandidate}
                onSelect={setSelectedCandidate}
                requiresSelection={requiresSelection}
              />

              <CreditCostButton
                label="Generate listing draft"
                creditCost={draftCost}
                availableCredits={availableCredits}
                loading={busy === 'draft'}
                loadingLabel="Writing the listing…"
                disabled={busy !== null || (requiresSelection && selectedCandidate == null)}
                onConfirm={runGenerateDraft}
                icon={<Wand2 className="h-4 w-4" />}
                description="Title, description, category, attributes, condition notes, starting bid and duration."
              />

              <Button type="button" variant="outline" onClick={resetCapture} className="w-full">
                <RotateCcw className="mr-2 h-4 w-4" />
                Start over
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — review */}
        {step === 'review' && reviewValues && (
          <>
            <Card className="border-indigo-200/70">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] text-white">
                    Step 3
                  </Badge>
                  <Badge variant="secondary">Review &amp; approve</Badge>
                </div>
                <CardTitle className="font-display text-2xl">Review the draft</CardTitle>
                <CardDescription>
                  Every field is editable. Nothing publishes until you approve it.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <DraftReview
                  values={reviewValues}
                  onChange={setReviewValues}
                  confidence={confidence}
                  confidenceReasons={confidenceReasons}
                  attributes={attributes}
                  originalImageCount={originalImages.length}
                  aiImageCount={generatedImages.length}
                  auctions={auctions}
                  selectedAuctionId={selectedAuctionId}
                  onAuctionChange={setSelectedAuctionId}
                  includeAiImages={includeAiImages}
                  onIncludeAiImagesChange={setIncludeAiImages}
                  moderationWarnings={moderationWarnings}
                  saving={busy === 'save'}
                  publishing={busy === 'publish'}
                  onSave={saveDraft}
                  onPublish={publishDraft}
                  onDiscard={removeDraft}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  Presentation images
                </CardTitle>
                <CardDescription>
                  Optional catalog imagery bought with ITC credits. Your verified originals stay
                  first and unchanged.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <AiImageStudio
                  draftId={draftId ?? undefined}
                  originalImages={originalImages}
                  generatedImages={generatedImages}
                  priceFor={priceFor}
                  availableCredits={availableCredits}
                  imageGenerationAvailable={pricing?.image_generation_available ?? false}
                  onGenerated={(image, charged) => {
                    setGeneratedImages((current) => [...current, image])
                    setNotice(`Presentation image ready — ${formatITC(charged)} used.`)
                    void refreshPricing()
                  }}
                  onError={setError}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-600" />
                ITC balance
              </span>
              <Link href="/wallet" className="text-xs font-semibold text-indigo-600 underline">
                Top up
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-bold text-slate-900">{formatITC(availableCredits)}</p>

            <ul className="space-y-1 text-xs text-slate-600">
              {(pricing?.prices ?? []).map((price) => (
                <li key={price.action_key} className="flex items-center justify-between gap-2">
                  <span className={price.is_enabled ? '' : 'line-through opacity-50'}>
                    {price.label}
                  </span>
                  <span className="font-semibold">{price.credit_cost} ITC</span>
                </li>
              ))}
            </ul>

            <p className="text-[11px] leading-snug text-slate-400">
              Credits are deducted only after a successful result. Failed or duplicate requests are
              never charged.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                Batch queue
              </span>
              {pendingCount > 0 && <Badge variant="secondary">{pendingCount} pending</Badge>}
            </CardTitle>
            <CardDescription className="text-xs">
              Scan → draft → approve → next item.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {step !== 'capture' && (
              <Button type="button" variant="outline" onClick={resetCapture} className="w-full">
                <ArrowRight className="mr-2 h-4 w-4" />
                Next item
              </Button>
            )}

            <BatchQueue drafts={queue} activeDraftId={draftId} onSelect={openQueueDraft} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
