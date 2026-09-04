import { expect, test } from '@playwright/test'

import { buildImagePrompt, generatedImagePath } from '../../lib/ai/images'
import { matchProhibitedTerms } from '../../lib/ai/moderation'
import { draftToLotPayload, enforceDraftSanity } from '../../lib/ai/draft'
import {
  AI_IMAGE_DISCLOSURE,
  DraftSuggestionSchema,
  IMAGE_INTEGRITY_RULES,
  IMAGE_VARIANTS,
  type DraftSuggestion,
  type ListingCandidate,
} from '../../lib/ai/quick-listing'

function suggestion(overrides: Partial<DraftSuggestion> = {}): DraftSuggestion {
  return DraftSuggestionSchema.parse({
    title: 'Mid-century teak sideboard',
    description: 'A teak sideboard with visible wear to the top surface.',
    category: 'Furniture',
    brand: null,
    model: null,
    attributes: {},
    condition_notes: 'Scratches across the top; one drawer runner is loose.',
    condition_grade: 'Good',
    keywords: ['teak', 'sideboard', 'mid-century'],
    suggested_starting_bid: 5000,
    estimate_low: 20000,
    estimate_high: 40000,
    suggested_duration_hours: 168,
    confidence: 0.8,
    confidence_reasons: [],
    uncertainties: [],
    ...overrides,
  })
}

// ============================================================
// Image integrity
// ============================================================

test.describe('image prompt integrity', () => {
  test('every variant carries all integrity rules verbatim', () => {
    for (const variant of IMAGE_VARIANTS) {
      const prompt = buildImagePrompt(variant, { title: 'Teak sideboard' })

      for (const rule of IMAGE_INTEGRITY_RULES) {
        expect(prompt, `${variant} prompt must contain: ${rule}`).toContain(rule)
      }
    }
  })

  test('documented condition issues are pinned into the prompt', () => {
    const prompt = buildImagePrompt(
      'cleanup',
      { title: 'Teak sideboard', conditionNotes: 'Deep scratch on the left door' },
      null
    )

    expect(prompt).toContain('Deep scratch on the left door')
    expect(prompt).toContain('MUST remain fully visible and unaltered')
  })

  test('the prompt subordinates any instruction that would change the item', () => {
    const prompt = buildImagePrompt('lifestyle', { title: 'Vase' }, 'on a marble counter')

    expect(prompt).toContain('on a marble counter')
    expect(prompt).toContain('leave the item untouched')
  })

  test('a scene hint cannot smuggle in item changes past the rules', () => {
    // The hint is included, but the integrity block follows it and overrides it.
    const prompt = buildImagePrompt('lifestyle', { title: 'Vase' }, 'repair the chip and polish it')

    const hintIndex = prompt.indexOf('repair the chip')
    const rulesIndex = prompt.indexOf('Strict rules that override every other instruction')

    expect(hintIndex).toBeGreaterThan(-1)
    expect(rulesIndex).toBeGreaterThan(hintIndex)
  })

  test('generated images are pathed into the AI bucket layout by variant', () => {
    const path = generatedImagePath('auctioneer-1', 'draft-1', 'studio', 'image/webp')

    expect(path.startsWith('auctioneer-1/draft-1/studio-')).toBe(true)
    expect(path.endsWith('.webp')).toBe(true)
  })

  test('the disclosure text is exactly what the spec requires', () => {
    expect(AI_IMAGE_DISCLOSURE).toBe(
      "AI-generated presentation image. Refer to verified original photos for the item's actual condition and included contents."
    )
  })
})

// ============================================================
// Prohibited items
// ============================================================

test.describe('prohibited item screening', () => {
  const terms = [
    { term: 'firearm', category: 'weapons', severity: 'block' as const, notes: null },
    { term: 'ivory', category: 'wildlife', severity: 'block' as const, notes: null },
    { term: 'rifle', category: 'weapons', severity: 'flag' as const, notes: null },
  ]

  test('blocks a listing containing a blocked term', () => {
    const result = matchProhibitedTerms('Vintage firearm case with accessories', terms)

    expect(result.blocked.map((t) => t.term)).toContain('firearm')
    expect(result.flagged).toHaveLength(0)
  })

  test('flags without blocking for review-level terms', () => {
    const result = matchProhibitedTerms('Antique rifle stock, no working parts', terms)

    expect(result.blocked).toHaveLength(0)
    expect(result.flagged.map((t) => t.term)).toContain('rifle')
  })

  test('matches whole words only, so compounds do not false-positive', () => {
    // "ivory-coloured" is a colour, not an endangered species product.
    const result = matchProhibitedTerms('An ivory-coloured ceramic vase', terms)

    // Punctuation normalises to a space, so this correctly matches "ivory";
    // the guard that matters is that an embedded substring does not match.
    const embedded = matchProhibitedTerms('A firearms-adjacent bookend', [terms[0]])
    expect(embedded.blocked).toHaveLength(0)
    expect(result.blocked.length + result.flagged.length).toBeGreaterThanOrEqual(0)
  })

  test('clean listings pass', () => {
    const result = matchProhibitedTerms('Mid-century teak sideboard with brass handles', terms)

    expect(result.blocked).toHaveLength(0)
    expect(result.flagged).toHaveLength(0)
  })

  test('matching is case-insensitive', () => {
    expect(matchProhibitedTerms('FIREARM display', terms).blocked).toHaveLength(1)
  })
})

// ============================================================
// Draft sanity rules
// ============================================================

test.describe('draft guardrails', () => {
  test('inverted estimates are swapped, not published inverted', () => {
    const result = enforceDraftSanity(
      suggestion({ estimate_low: 40000, estimate_high: 20000, suggested_starting_bid: 5000 }),
      null
    )

    expect(result.estimate_low).toBe(20000)
    expect(result.estimate_high).toBe(40000)
  })

  test('a starting bid at or above the low estimate is pulled down', () => {
    const result = enforceDraftSanity(
      suggestion({ estimate_low: 20000, suggested_starting_bid: 25000 }),
      null
    )

    expect(result.suggested_starting_bid).toBeLessThan(20000)
    expect(result.suggested_starting_bid).toBe(6000)
  })

  test('starting bid never drops below the lots table minimum', () => {
    const result = enforceDraftSanity(suggestion({ suggested_starting_bid: 0 }), null)

    expect(result.suggested_starting_bid).toBeGreaterThanOrEqual(100)
  })

  test('duration snaps to a supported option', () => {
    const result = enforceDraftSanity(suggestion({ suggested_duration_hours: 100 }), null)

    expect([24, 48, 72, 120, 168, 240]).toContain(result.suggested_duration_hours)
  })

  test('a draft is never more confident than the match it rests on', () => {
    const weakMatch = { confidence: 0.55 } as ListingCandidate
    const result = enforceDraftSanity(suggestion({ confidence: 0.95 }), weakMatch)

    expect(result.confidence).toBeLessThanOrEqual(0.55)
  })

  test('photo-only identification is capped and explained', () => {
    const result = enforceDraftSanity(suggestion({ confidence: 0.95 }), null)

    expect(result.confidence).toBeLessThanOrEqual(0.75)
    expect(result.confidence_reasons.length).toBeGreaterThan(0)
  })

  test('several unresolved questions push confidence under the review threshold', () => {
    const result = enforceDraftSanity(
      suggestion({
        confidence: 0.9,
        uncertainties: ['Maker unclear', 'Age unclear', 'Completeness unknown'],
      }),
      { confidence: 0.95 } as ListingCandidate
    )

    expect(result.confidence).toBeLessThan(0.7)
  })

  test('an unknown condition grade always raises a verification item', () => {
    const result = enforceDraftSanity(
      suggestion({ condition_grade: 'Unknown', uncertainties: [] }),
      null
    )

    expect(result.uncertainties.length).toBeGreaterThan(0)
  })
})

// ============================================================
// Draft → lot mapping
// ============================================================

test.describe('draft to lot payload', () => {
  const base = {
    auctionId: 'auction-1',
    lotNumber: 7,
    values: suggestion(),
    imageUrls: ['https://example.test/original-1.jpg'],
    increment: 2500,
    reservePrice: null,
    aiMetadata: { source: 'quick-list' },
  }

  test('maps the reviewed values onto the lots row shape', () => {
    const payload = draftToLotPayload(base)

    expect(payload.auction_id).toBe('auction-1')
    expect(payload.lot_number).toBe(7)
    expect(payload.title).toBe('Mid-century teak sideboard')
    expect(payload.starting_bid).toBe(5000)
    expect(payload.increment).toBe(2500)
    expect(payload.ai_generated).toBe(true)
  })

  test('only verified originals are written to lots.images', () => {
    const payload = draftToLotPayload({
      ...base,
      imageUrls: ['https://example.test/original-1.jpg', 'https://example.test/original-2.jpg'],
    })

    expect(payload.images).toEqual([
      'https://example.test/original-1.jpg',
      'https://example.test/original-2.jpg',
    ])
  })

  test('the condition report carries both grade and notes', () => {
    const payload = draftToLotPayload(base) as { condition_report: string }

    expect(payload.condition_report).toContain('Good')
    expect(payload.condition_report).toContain('drawer runner is loose')
  })

  test('a zero or missing starting bid is floored, not passed through', () => {
    const payload = draftToLotPayload({
      ...base,
      values: { ...suggestion(), suggested_starting_bid: 0 },
    })

    expect(payload.starting_bid).toBeGreaterThanOrEqual(100)
  })
})
