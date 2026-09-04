import { expect, test } from '@playwright/test'

import { mergeCandidates } from '../../lib/ai/identify'
import {
  CandidateSchema,
  confidenceBand,
  needsCandidateSelection,
  resolveDraftField,
  resolvedDraftValues,
  type ListingCandidate,
} from '../../lib/ai/quick-listing'

function candidate(overrides: Partial<ListingCandidate> = {}): ListingCandidate {
  return CandidateSchema.parse({
    title: 'Sony WH-1000XM4 Headphones',
    brand: 'Sony',
    model: 'WH-1000XM4',
    category: 'Electronics',
    identifier: null,
    summary: '',
    confidence: 0.9,
    source: 'upcitemdb',
    source_url: null,
    image_url: null,
    attributes: {},
    ...overrides,
  })
}

test.describe('candidate selection gating', () => {
  test('no candidates needs no selection', () => {
    expect(needsCandidateSelection([])).toBe(false)
  })

  test('a single confident candidate needs no selection', () => {
    expect(needsCandidateSelection([candidate({ confidence: 0.92 })])).toBe(false)
  })

  test('a single weak candidate still needs confirmation', () => {
    expect(needsCandidateSelection([candidate({ confidence: 0.5 })])).toBe(true)
  })

  test('a clear leader needs no selection', () => {
    expect(
      needsCandidateSelection([
        candidate({ confidence: 0.92 }),
        candidate({ title: 'Sony WH-1000XM3', confidence: 0.5 }),
      ])
    ).toBe(false)
  })

  test('close rivals force the auctioneer to choose', () => {
    // 0.05 apart — the platform must not pick for them.
    expect(
      needsCandidateSelection([
        candidate({ confidence: 0.85 }),
        candidate({ title: 'Sony WH-1000XM3', confidence: 0.8 }),
      ])
    ).toBe(true)
  })

  test('all-weak candidates force a choice', () => {
    expect(
      needsCandidateSelection([
        candidate({ confidence: 0.45 }),
        candidate({ title: 'Other', confidence: 0.2 }),
      ])
    ).toBe(true)
  })
})

test.describe('merging catalog and vision candidates', () => {
  test('agreement across sources raises confidence and merges attributes', () => {
    const merged = mergeCandidates(
      [candidate({ confidence: 0.9, attributes: { Brand: 'Sony' } })],
      [candidate({ source: 'vision', confidence: 0.8, attributes: { Color: 'Black' } })]
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].confidence).toBeGreaterThan(0.9)
    expect(merged[0].source).toContain('+')
    expect(merged[0].attributes).toMatchObject({ Brand: 'Sony', Color: 'Black' })
  })

  test('merged confidence never reaches certainty', () => {
    const merged = mergeCandidates(
      [candidate({ confidence: 0.97 })],
      [candidate({ source: 'vision', confidence: 0.97 })]
    )

    expect(merged[0].confidence).toBeLessThanOrEqual(0.98)
  })

  test('disagreement keeps both options and lowers every score', () => {
    const merged = mergeCandidates(
      [candidate({ title: 'Sony WH-1000XM4', confidence: 0.9 })],
      [
        candidate({
          title: 'Bose QuietComfort 45',
          brand: 'Bose',
          model: 'QC45',
          source: 'vision',
          confidence: 0.8,
        }),
      ]
    )

    // Both survive — the barcode and the photos disagree, so the auctioneer
    // decides which is right.
    expect(merged).toHaveLength(2)
    expect(merged[0].confidence).toBeLessThan(0.9)
    expect(needsCandidateSelection(merged)).toBe(true)
  })

  test('results are ordered by confidence and capped', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      candidate({ title: `Item ${index}`, model: `M${index}`, confidence: index / 10 })
    )

    const merged = mergeCandidates(many, [])

    expect(merged.length).toBeLessThanOrEqual(6)
    expect(merged[0].confidence).toBeGreaterThanOrEqual(merged[1].confidence)
  })
})

test.describe('confidence bands', () => {
  test('bands map to review urgency', () => {
    expect(confidenceBand(0.95).tone).toBe('high')
    expect(confidenceBand(0.75).tone).toBe('medium')
    expect(confidenceBand(0.4).tone).toBe('low')
    expect(confidenceBand(null).tone).toBe('low')
  })
})

test.describe('draft field resolution', () => {
  const draft = {
    suggested: { title: 'AI title', description: 'AI description' },
    edits: { title: 'Auctioneer title' },
  }

  test('auctioneer edits win over AI suggestions', () => {
    expect(resolveDraftField(draft as never, 'title')).toBe('Auctioneer title')
  })

  test('unedited fields fall through to the AI suggestion', () => {
    expect(resolveDraftField(draft as never, 'description')).toBe('AI description')
  })

  test('resolved values merge both layers', () => {
    expect(resolvedDraftValues(draft as never)).toEqual({
      title: 'Auctioneer title',
      description: 'AI description',
    })
  })
})
