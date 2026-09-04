'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatDollars } from '@/lib/utils'
import {
  AUCTION_DURATION_OPTIONS,
  CONFIDENCE_REVIEW_THRESHOLD,
  confidenceBand,
  VERIFIED_ORIGINALS_LABEL,
  type DraftSuggestion,
} from '@/lib/ai/quick-listing'

export interface ReviewValues {
  title: string
  description: string
  category: string
  brand: string
  model: string
  conditionNotes: string
  conditionGrade: DraftSuggestion['condition_grade']
  keywords: string
  startingBid: string
  estimateLow: string
  estimateHigh: string
  reservePrice: string
  increment: string
  durationHours: number
}

interface AuctionOption {
  id: string
  title: string
  status: string
  ends_at: string
}

interface DraftReviewProps {
  values: ReviewValues
  onChange: (values: ReviewValues) => void
  confidence: number | null
  confidenceReasons: string[]
  attributes: Record<string, string>
  originalImageCount: number
  aiImageCount: number
  auctions: AuctionOption[]
  selectedAuctionId: string
  onAuctionChange: (auctionId: string) => void
  includeAiImages: boolean
  onIncludeAiImagesChange: (include: boolean) => void
  moderationWarnings: string[]
  saving: boolean
  publishing: boolean
  onSave: () => void
  onPublish: () => void
  onDiscard: () => void
}

function centsToInput(cents: number | null | undefined) {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

export function inputToCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Enter a valid non-negative USD amount')
  }

  return Math.round(parsed * 100)
}

export function reviewValuesFromDraft(
  values: Partial<DraftSuggestion>,
  overrides?: Partial<ReviewValues>
): ReviewValues {
  return {
    title: values.title ?? '',
    description: values.description ?? '',
    category: values.category ?? '',
    brand: values.brand ?? '',
    model: values.model ?? '',
    conditionNotes: values.condition_notes ?? '',
    conditionGrade: values.condition_grade ?? 'Unknown',
    keywords: (values.keywords ?? []).join(', '),
    startingBid: centsToInput(values.suggested_starting_bid),
    estimateLow: centsToInput(values.estimate_low),
    estimateHigh: centsToInput(values.estimate_high),
    reservePrice: '',
    increment: '25.00',
    durationHours: values.suggested_duration_hours ?? 168,
    ...overrides,
  }
}

const CONDITION_GRADES: DraftSuggestion['condition_grade'][] = [
  'Excellent',
  'Very Good',
  'Good',
  'Fair',
  'Poor',
  'Unknown',
]

const TONE_STYLES = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-rose-200 bg-rose-50 text-rose-800',
} as const

/**
 * Review + edit + approve. Every field is editable, and publishing requires an
 * explicit confirmation — an AI draft never auto-publishes.
 */
export function DraftReview({
  values,
  onChange,
  confidence,
  confidenceReasons,
  attributes,
  originalImageCount,
  aiImageCount,
  auctions,
  selectedAuctionId,
  onAuctionChange,
  includeAiImages,
  onIncludeAiImagesChange,
  moderationWarnings,
  saving,
  publishing,
  onSave,
  onPublish,
  onDiscard,
}: DraftReviewProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const band = confidenceBand(confidence)
  const lowConfidence = confidence != null && confidence < CONFIDENCE_REVIEW_THRESHOLD

  // Any material edit invalidates a prior acknowledgement.
  useEffect(() => {
    setAcknowledged(false)
  }, [values.title, values.description, values.startingBid, selectedAuctionId])

  const set = <K extends keyof ReviewValues>(key: K, value: ReviewValues[K]) => {
    onChange({ ...values, [key]: value })
  }

  const blockingIssues = useMemo(() => {
    const issues: string[] = []
    if (!values.title.trim()) issues.push('Add a title')
    if (!values.description.trim()) issues.push('Add a description')
    if (!values.startingBid.trim() || Number(values.startingBid) <= 0) {
      issues.push('Set a starting bid above $0.00')
    }
    if (!selectedAuctionId) issues.push('Choose the auction to publish into')
    if (originalImageCount === 0) issues.push('Add at least one verified original photo')

    const low = Number(values.estimateLow)
    const high = Number(values.estimateHigh)
    if (values.estimateLow && values.estimateHigh && high < low) {
      issues.push('High estimate must be at least the low estimate')
    }

    const reserve = Number(values.reservePrice)
    const start = Number(values.startingBid)
    if (values.reservePrice && reserve < start) {
      issues.push('Reserve cannot be below the starting bid')
    }

    return issues
  }, [values, selectedAuctionId, originalImageCount])

  const canPublish = blockingIssues.length === 0 && acknowledged && !publishing && !saving

  return (
    <div className="space-y-5">
      {/* Confidence */}
      <div className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3', TONE_STYLES[band.tone])}>
        {band.tone === 'high' ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">
            {band.label}
            {confidence != null && ` — ${Math.round(confidence * 100)}%`}
          </p>
          {confidenceReasons.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5 text-xs">
              {confidenceReasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          )}
          {lowConfidence && (
            <p className="text-xs font-medium">
              Check every field carefully before publishing.
            </p>
          )}
        </div>
      </div>

      {moderationWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="mb-1 font-semibold">Review before publishing:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {moderationWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="review-title">Title</Label>
          <Input
            id="review-title"
            value={values.title}
            onChange={(event) => set('title', event.target.value)}
            maxLength={140}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="review-description">Description</Label>
          <Textarea
            id="review-description"
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            rows={7}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-category">Category</Label>
          <Input
            id="review-category"
            value={values.category}
            onChange={(event) => set('category', event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-brand">Brand</Label>
          <Input
            id="review-brand"
            value={values.brand}
            onChange={(event) => set('brand', event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-model">Model</Label>
          <Input
            id="review-model"
            value={values.model}
            onChange={(event) => set('model', event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-grade">Condition grade</Label>
          <select
            id="review-grade"
            value={values.conditionGrade}
            onChange={(event) =>
              set('conditionGrade', event.target.value as DraftSuggestion['condition_grade'])
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CONDITION_GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="review-condition">Condition notes</Label>
          <Textarea
            id="review-condition"
            value={values.conditionNotes}
            onChange={(event) => set('conditionNotes', event.target.value)}
            rows={5}
          />
          <p className="text-xs text-slate-500">
            Buyers rely on this plus your {VERIFIED_ORIGINALS_LABEL.toLowerCase()}. Be explicit
            about wear and missing parts.
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="review-keywords">Keywords</Label>
          <Input
            id="review-keywords"
            value={values.keywords}
            onChange={(event) => set('keywords', event.target.value)}
            placeholder="comma, separated, terms"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-starting-bid">Starting bid (USD)</Label>
          <Input
            id="review-starting-bid"
            value={values.startingBid}
            onChange={(event) => set('startingBid', event.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-increment">Bid increment (USD)</Label>
          <Input
            id="review-increment"
            value={values.increment}
            onChange={(event) => set('increment', event.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-estimate-low">Estimate low (USD)</Label>
          <Input
            id="review-estimate-low"
            value={values.estimateLow}
            onChange={(event) => set('estimateLow', event.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-estimate-high">Estimate high (USD)</Label>
          <Input
            id="review-estimate-high"
            value={values.estimateHigh}
            onChange={(event) => set('estimateHigh', event.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-reserve">Reserve (USD, optional)</Label>
          <Input
            id="review-reserve"
            value={values.reservePrice}
            onChange={(event) => set('reservePrice', event.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="review-duration">Auction duration</Label>
          <select
            id="review-duration"
            value={values.durationHours}
            onChange={(event) => set('durationHours', Number(event.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {AUCTION_DURATION_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {hours >= 24 ? `${hours / 24} day${hours === 24 ? '' : 's'}` : `${hours} hours`}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Suggested duration — the lot ends when its auction ends.
          </p>
        </div>
      </div>

      {Object.keys(attributes).length > 0 && (
        <div className="space-y-2">
          <Label>Detected attributes</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(attributes).map(([key, value]) => (
              <Badge key={key} variant="secondary" className="text-[11px]">
                {key}: {value}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Publish target */}
      <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
        <div className="space-y-2">
          <Label htmlFor="review-auction">Publish into auction</Label>
          <select
            id="review-auction"
            value={selectedAuctionId}
            onChange={(event) => onAuctionChange(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select an auction…</option>
            {auctions.map((auction) => (
              <option key={auction.id} value={auction.id}>
                {auction.title} ({auction.status})
              </option>
            ))}
          </select>
          {auctions.length === 0 && (
            <p className="text-xs text-amber-700">
              You have no open auctions.{' '}
              <a href="/org/auctions/new" className="font-semibold underline">
                Create one first
              </a>
              .
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            {originalImageCount} verified original{originalImageCount === 1 ? '' : 's'}
          </span>
          {aiImageCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-800">
              <Sparkles className="h-3.5 w-3.5" />
              {aiImageCount} AI mockup{aiImageCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {aiImageCount > 0 && (
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={includeAiImages}
              onChange={(event) => onIncludeAiImagesChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              Publish the AI mockups too. They appear in a separate, labelled AI-Enhanced section —
              never as the item’s primary photo.
            </span>
          </label>
        )}
      </div>

      {/* Blocking issues */}
      {blockingIssues.length > 0 && (
        <ul className="space-y-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          {blockingIssues.map((issue) => (
            <li key={issue} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              {issue}
            </li>
          ))}
        </ul>
      )}

      {/* Approval gate */}
      <label
        className={cn(
          'flex items-start gap-3 rounded-2xl border-2 p-4 transition',
          acknowledged ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'
        )}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">
          <strong className="block text-slate-900">I have reviewed this listing.</strong>
          The title, description and condition notes accurately describe the item as pictured, and
          I approve publishing it. AI drafts are never published without this confirmation.
        </span>
      </label>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="flex-1 btn-glow"
        >
          {publishing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {publishing ? 'Publishing…' : 'Approve & publish lot'}
        </Button>

        <Button type="button" variant="outline" onClick={onSave} disabled={saving || publishing}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save draft
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          disabled={saving || publishing}
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Discard
        </Button>
      </div>

      {values.startingBid && (
        <p className="text-center text-xs text-slate-400">
          Bidding opens at {formatDollars(Number(values.startingBid) * 100)}
        </p>
      )}
    </div>
  )
}
