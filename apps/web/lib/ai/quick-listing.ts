import { z } from 'zod'

/**
 * Shared contracts for AI Quick Listing & Product Presentation.
 *
 * Imported by both server routes and client components, so this module must
 * stay free of any server-only dependency.
 */

// ============================================================
// Auction integrity — the non-negotiables
// ============================================================

/**
 * The exact disclosure that must accompany every AI-generated presentation
 * image, wherever it is shown. Stored per-row in `lot_images.disclosure_label`
 * so the text that was live at generation time stays auditable.
 */
export const AI_IMAGE_DISCLOSURE =
  "AI-generated presentation image. Refer to verified original photos for the item's actual condition and included contents."

export const VERIFIED_ORIGINALS_LABEL = 'Verified Original Photos'
export const AI_ENHANCED_LABEL = 'AI-Enhanced / Visual Mockups'

/** Verified originals and generated images are separated at the storage layer too. */
export const ORIGINAL_IMAGE_BUCKET = 'lot-images'
export const AI_IMAGE_BUCKET = 'ai-generated'

/**
 * Injected into every image-generation prompt. These rules exist to keep a
 * presentation image from becoming a misrepresentation of the lot.
 */
export const IMAGE_INTEGRITY_RULES = [
  'Do not add, remove, hide, repair, clean, restore or conceal any damage, wear, scratch, stain, crack, chip, fading or defect.',
  'Do not add or remove accessories, parts, packaging, documentation or any included contents.',
  'Do not add, remove, alter, sharpen or invent branding, logos, labels, serial numbers or text.',
  'Do not change the quantity of items shown.',
  'Do not change the colour, material, shape, size, proportions or apparent age of the item.',
  'Do not upgrade, idealise or "restore" the item in any way.',
  'The item itself must remain pixel-faithful; only the surrounding environment, background and lighting may change.',
] as const

export const IMAGE_NEGATIVE_PROMPT = [
  'repaired damage',
  'removed scratches',
  'cleaned surface',
  'restored condition',
  'added accessories',
  'extra items',
  'invented text',
  'fake branding',
  'altered logo',
  'different color',
  'new condition',
].join(', ')

// ============================================================
// Billable AI actions
// ============================================================

export const AI_ACTION_KEYS = [
  'quick_list_identify',
  'quick_list_draft',
  'quick_list_condition',
  'image_cleanup',
  'image_studio',
  'image_lifestyle',
] as const

export type AiActionKey = (typeof AI_ACTION_KEYS)[number]

export const IMAGE_VARIANTS = ['cleanup', 'studio', 'lifestyle'] as const
export type ImageVariant = (typeof IMAGE_VARIANTS)[number]

export const IMAGE_VARIANT_ACTION: Record<ImageVariant, AiActionKey> = {
  cleanup: 'image_cleanup',
  studio: 'image_studio',
  lifestyle: 'image_lifestyle',
}

export const IMAGE_VARIANT_LABEL: Record<ImageVariant, string> = {
  cleanup: 'Clean background',
  studio: 'Professional presentation',
  lifestyle: 'Lifestyle mockup',
}

export const IMAGE_VARIANT_DESCRIPTION: Record<ImageVariant, string> = {
  cleanup:
    'Places the item on a clean, neutral studio background. Removes background clutter only — never the item’s own condition.',
  studio:
    'Adds even, professional catalog lighting and a subtle surface shadow. The item is untouched.',
  lifestyle:
    'Stages the item in a realistic room setting so buyers can judge scale and context.',
}

export interface AiActionPrice {
  action_key: string
  label: string
  description: string | null
  category: 'listing' | 'image'
  credit_cost: number
  is_enabled: boolean
  provider: string | null
  model: string | null
  rate_limit_per_hour: number
  sort_order: number
}

// ============================================================
// Barcode handling
// ============================================================

export const SCAN_FORMATS = [
  'upc_a',
  'upc_e',
  'ean_13',
  'ean_8',
  'isbn_10',
  'isbn_13',
  'sku',
  'other',
] as const

export type ScanFormat = (typeof SCAN_FORMATS)[number]

export const SCAN_FORMAT_LABEL: Record<ScanFormat, string> = {
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  ean_13: 'EAN-13',
  ean_8: 'EAN-8',
  isbn_10: 'ISBN-10',
  isbn_13: 'ISBN-13',
  sku: 'SKU',
  other: 'Code',
}

/** Strip separators and uppercase — barcodes are scanned in the wild. */
export function normalizeScanValue(raw: string): string {
  return raw.trim().replace(/[\s-]/g, '').toUpperCase()
}

function isNumeric(value: string) {
  return /^\d+$/.test(value)
}

/** ISBN-10 checksum: positional weights 10..1, mod 11, 'X' = 10. */
export function isValidIsbn10(value: string): boolean {
  const v = normalizeScanValue(value)
  if (!/^\d{9}[\dX]$/.test(v)) return false

  let sum = 0
  for (let i = 0; i < 9; i += 1) {
    sum += Number(v[i]) * (10 - i)
  }
  sum += v[9] === 'X' ? 10 : Number(v[9])

  return sum % 11 === 0
}

/** EAN-13 / ISBN-13 / UPC-A checksum: alternating 1/3 weights, mod 10. */
export function isValidEan13(value: string): boolean {
  const v = normalizeScanValue(value)
  if (!/^\d{13}$/.test(v)) return false

  let sum = 0
  for (let i = 0; i < 12; i += 1) {
    sum += Number(v[i]) * (i % 2 === 0 ? 1 : 3)
  }

  return (10 - (sum % 10)) % 10 === Number(v[12])
}

export function isValidUpcA(value: string): boolean {
  const v = normalizeScanValue(value)
  if (!/^\d{12}$/.test(v)) return false

  return isValidEan13(`0${v}`)
}

/** UPC-A is EAN-13 with a leading zero; normalizing lets one lookup serve both. */
export function upcAToEan13(value: string): string {
  const v = normalizeScanValue(value)
  return /^\d{12}$/.test(v) ? `0${v}` : v
}

export interface ClassifiedScan {
  value: string
  /** Canonical form used for provider lookups (EAN-13 where applicable). */
  lookupValue: string
  format: ScanFormat
  checksumValid: boolean
}

/**
 * Work out what kind of code the auctioneer scanned or typed. A failed checksum
 * is reported rather than rejected — a mis-scan should surface as low confidence
 * and a candidate list, not a hard error.
 */
export function classifyScan(raw: string): ClassifiedScan | null {
  const value = normalizeScanValue(raw)
  if (!value) return null

  if (isNumeric(value) && value.length === 13) {
    // 978/979 prefixes are Bookland — an ISBN-13 in EAN clothing.
    const isBookland = value.startsWith('978') || value.startsWith('979')
    return {
      value,
      lookupValue: value,
      format: isBookland ? 'isbn_13' : 'ean_13',
      checksumValid: isValidEan13(value),
    }
  }

  if (isNumeric(value) && value.length === 12) {
    return {
      value,
      lookupValue: upcAToEan13(value),
      format: 'upc_a',
      checksumValid: isValidUpcA(value),
    }
  }

  if (isNumeric(value) && value.length === 8) {
    return { value, lookupValue: value, format: 'ean_8', checksumValid: true }
  }

  if (/^\d{9}[\dX]$/.test(value)) {
    return {
      value,
      lookupValue: value,
      format: 'isbn_10',
      checksumValid: isValidIsbn10(value),
    }
  }

  if (isNumeric(value) && value.length === 6) {
    return { value, lookupValue: value, format: 'upc_e', checksumValid: true }
  }

  if (/^[A-Z0-9._/-]{3,40}$/.test(value)) {
    return { value, lookupValue: value, format: 'sku', checksumValid: true }
  }

  return { value, lookupValue: value, format: 'other', checksumValid: true }
}

// ============================================================
// Draft payloads
// ============================================================

export const AUCTION_DURATION_OPTIONS = [24, 48, 72, 120, 168, 240] as const

export const CandidateSchema = z.object({
  title: z.string().min(1).max(140),
  brand: z.string().max(80).nullable().default(null),
  model: z.string().max(120).nullable().default(null),
  category: z.string().max(80).nullable().default(null),
  identifier: z.string().max(60).nullable().default(null),
  summary: z.string().max(600).default(''),
  confidence: z.number().min(0).max(1),
  source: z.string().max(60),
  source_url: z.string().max(500).nullable().default(null),
  image_url: z.string().max(500).nullable().default(null),
  attributes: z.record(z.string(), z.string()).default({}),
})

export type ListingCandidate = z.infer<typeof CandidateSchema>

export const DraftSuggestionSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(6000),
  category: z.string().min(1).max(80),
  brand: z.string().max(80).nullable().default(null),
  model: z.string().max(120).nullable().default(null),
  attributes: z.record(z.string(), z.string()).default({}),
  condition_notes: z.string().max(3000).default(''),
  condition_grade: z
    .enum(['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Unknown'])
    .default('Unknown'),
  keywords: z.array(z.string().min(1).max(40)).max(15).default([]),
  /** ITC / cents — matches the rest of the platform's money handling. */
  suggested_starting_bid: z.number().int().min(0).max(100_000_000),
  estimate_low: z.number().int().min(0).max(100_000_000).nullable().default(null),
  estimate_high: z.number().int().min(0).max(100_000_000).nullable().default(null),
  suggested_duration_hours: z.number().int().min(1).max(720).default(168),
  confidence: z.number().min(0).max(1),
  confidence_reasons: z.array(z.string().max(240)).max(8).default([]),
  uncertainties: z.array(z.string().max(240)).max(8).default([]),
})

export type DraftSuggestion = z.infer<typeof DraftSuggestionSchema>

export const DRAFT_STATUSES = [
  'capturing',
  'identifying',
  'needs_selection',
  'draft_ready',
  'approved',
  'discarded',
  'blocked',
  'failed',
] as const

export type DraftStatus = (typeof DRAFT_STATUSES)[number]

export interface QuickListDraft {
  id: string
  auctioneer_id: string
  created_by: string
  auction_id: string | null
  status: DraftStatus
  capture_mode: 'barcode' | 'photo' | 'manual' | 'hybrid'
  scan_value: string | null
  scan_format: ScanFormat | null
  manual_context: string | null
  candidates: ListingCandidate[]
  selected_candidate_index: number | null
  suggested: Partial<DraftSuggestion>
  edits: Record<string, unknown>
  confidence: number | null
  confidence_reasons: string[]
  moderation_status: 'pending' | 'passed' | 'flagged' | 'blocked'
  moderation_result: Record<string, unknown>
  suggested_starting_bid: number | null
  suggested_duration_hours: number | null
  lot_id: string | null
  approved_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface LotImageRecord {
  id: string
  lot_id: string | null
  draft_id: string | null
  kind: 'original' | 'ai_generated'
  bucket: string
  storage_path: string
  public_url: string
  position: number
  is_primary: boolean
  checksum_sha256: string | null
  variant: ImageVariant | null
  source_image_id: string | null
  prompt: string | null
  provider: string | null
  model: string | null
  provider_job_id: string | null
  disclosure_label: string | null
  moderation_status: 'pending' | 'passed' | 'flagged' | 'blocked'
  created_at: string
}

// ============================================================
// Request schemas (shared by client fetchers and route handlers)
// ============================================================

export const UploadedImageSchema = z.object({
  bucket: z.string().min(1).max(60),
  storage_path: z.string().min(1).max(400),
  public_url: z.string().url().max(600),
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  byte_size: z.number().int().positive().max(20_000_000).nullable().default(null),
  mime_type: z.string().max(80).nullable().default(null),
  width: z.number().int().positive().max(20000).nullable().default(null),
  height: z.number().int().positive().max(20000).nullable().default(null),
})

export type UploadedImage = z.infer<typeof UploadedImageSchema>

export const IdentifyRequestSchema = z
  .object({
    idempotency_key: z.string().min(8).max(120),
    auction_id: z.string().uuid().optional(),
    scan_value: z.string().trim().min(1).max(80).optional(),
    manual_context: z.string().trim().max(1000).optional(),
    images: z.array(UploadedImageSchema).max(8).default([]),
  })
  .refine((v) => Boolean(v.scan_value) || v.images.length > 0, {
    message: 'Provide a barcode/SKU or at least one photo',
    path: ['scan_value'],
  })

export const DraftGenerateRequestSchema = z.object({
  idempotency_key: z.string().min(8).max(120),
  candidate_index: z.number().int().min(0).max(20).nullable().optional(),
  manual_context: z.string().trim().max(1000).optional(),
})

export const DraftPatchSchema = z.object({
  auction_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().min(1).max(6000).optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  condition_notes: z.string().trim().max(3000).optional(),
  condition_grade: z
    .enum(['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Unknown'])
    .optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  suggested_starting_bid: z.number().int().min(1).max(100_000_000).optional(),
  estimate_low: z.number().int().min(0).max(100_000_000).nullable().optional(),
  estimate_high: z.number().int().min(0).max(100_000_000).nullable().optional(),
  suggested_duration_hours: z.number().int().min(1).max(720).optional(),
  selected_candidate_index: z.number().int().min(0).max(20).nullable().optional(),
})

export const DraftApproveSchema = z.object({
  auction_id: z.string().uuid(),
  reserve_price: z.number().int().min(0).max(100_000_000).nullable().optional(),
  increment: z.number().int().min(1).max(10_000_000).default(2500),
  include_ai_images: z.boolean().default(true),
  /** The auctioneer must actively confirm they reviewed the draft. */
  confirmed_reviewed: z.literal(true),
})

export const ImageGenerateRequestSchema = z.object({
  idempotency_key: z.string().min(8).max(120),
  variant: z.enum(IMAGE_VARIANTS),
  source_image_id: z.string().uuid(),
  draft_id: z.string().uuid().optional(),
  lot_id: z.string().uuid().optional(),
  /** Optional scene direction for lifestyle mockups (never item claims). */
  scene_hint: z.string().trim().max(240).optional(),
})

// ============================================================
// Draft helpers
// ============================================================

/** The auctioneer's edits always win over the AI suggestion. */
export function resolveDraftField<K extends keyof DraftSuggestion>(
  draft: Pick<QuickListDraft, 'suggested' | 'edits'>,
  key: K
): DraftSuggestion[K] | undefined {
  const edited = (draft.edits as Record<string, unknown>)[key as string]
  if (edited !== undefined && edited !== null) {
    return edited as DraftSuggestion[K]
  }

  return draft.suggested[key] as DraftSuggestion[K] | undefined
}

export function resolvedDraftValues(
  draft: Pick<QuickListDraft, 'suggested' | 'edits'>
): Partial<DraftSuggestion> {
  return { ...draft.suggested, ...(draft.edits as Partial<DraftSuggestion>) }
}

export const CONFIDENCE_REVIEW_THRESHOLD = 0.7

export function confidenceBand(confidence: number | null | undefined): {
  label: string
  tone: 'high' | 'medium' | 'low'
} {
  if (confidence == null) return { label: 'Unscored', tone: 'low' }
  if (confidence >= 0.85) return { label: 'High confidence', tone: 'high' }
  if (confidence >= CONFIDENCE_REVIEW_THRESHOLD) {
    return { label: 'Medium confidence', tone: 'medium' }
  }
  return { label: 'Low confidence', tone: 'low' }
}

/**
 * Candidates are ambiguous when nothing is clearly ahead. In that case the
 * auctioneer picks — the platform never guesses on their behalf.
 */
export function needsCandidateSelection(candidates: ListingCandidate[]): boolean {
  if (candidates.length === 0) return false
  if (candidates.length === 1) return candidates[0].confidence < CONFIDENCE_REVIEW_THRESHOLD

  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence)
  const [best, runnerUp] = sorted

  if (best.confidence < CONFIDENCE_REVIEW_THRESHOLD) return true

  return best.confidence - runnerUp.confidence < 0.15
}

export function generateIdempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `${prefix}:${random}`
}
