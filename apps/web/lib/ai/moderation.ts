import OpenAI from 'openai'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Content moderation + prohibited-item screening for AI Quick Listing.
 *
 * Two independent checks:
 *   1. Prohibited items — an admin-editable term list in `ai_prohibited_terms`.
 *      This is auction-policy screening (weapons, wildlife, counterfeits…).
 *   2. Content moderation — OpenAI's moderation endpoint for unsafe content.
 *
 * `blocked` stops the action outright; `flagged` lets it proceed but records the
 * event and surfaces a warning the auctioneer must acknowledge.
 */

export type ModerationStatus = 'passed' | 'flagged' | 'blocked'

export interface ModerationOutcome {
  status: ModerationStatus
  categories: string[]
  reasons: string[]
  raw: Record<string, unknown>
}

interface ProhibitedTerm {
  term: string
  category: string
  severity: 'block' | 'flag'
  notes: string | null
}

let termCache: { terms: ProhibitedTerm[]; loadedAt: number } | null = null
const TERM_CACHE_MS = 60_000

async function loadProhibitedTerms(): Promise<ProhibitedTerm[]> {
  if (termCache && Date.now() - termCache.loadedAt < TERM_CACHE_MS) {
    return termCache.terms
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_prohibited_terms')
    .select('term, category, severity, notes')
    .eq('is_active', true)

  if (error) {
    console.error('[ai-moderation] failed to load prohibited terms', error.message)
    return termCache?.terms ?? []
  }

  const terms = (data ?? []) as unknown as ProhibitedTerm[]
  termCache = { terms, loadedAt: Date.now() }

  return terms
}

/** Exported for tests — pure matching with no database access. */
export function matchProhibitedTerms(
  text: string,
  terms: ProhibitedTerm[]
): { blocked: ProhibitedTerm[]; flagged: ProhibitedTerm[] } {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `

  const blocked: ProhibitedTerm[] = []
  const flagged: ProhibitedTerm[] = []

  for (const term of terms) {
    const needle = ` ${term.term.toLowerCase().trim()} `
    // Padded whole-phrase match so "gun" never fires on "shotgun shell casing
    // display" and "ivory" never fires on "ivory-coloured".
    if (haystack.includes(needle)) {
      if (term.severity === 'block') blocked.push(term)
      else flagged.push(term)
    }
  }

  return { blocked, flagged }
}

export async function screenProhibitedItems(text: string): Promise<ModerationOutcome> {
  const terms = await loadProhibitedTerms()
  const { blocked, flagged } = matchProhibitedTerms(text, terms)

  if (blocked.length > 0) {
    return {
      status: 'blocked',
      categories: [...new Set(blocked.map((t) => t.category))],
      reasons: blocked.map(
        (t) => t.notes || `"${t.term}" is on the platform's prohibited items list.`
      ),
      raw: { blocked, flagged },
    }
  }

  if (flagged.length > 0) {
    return {
      status: 'flagged',
      categories: [...new Set(flagged.map((t) => t.category))],
      reasons: flagged.map(
        (t) => t.notes || `"${t.term}" may be restricted — confirm you are allowed to sell it.`
      ),
      raw: { blocked, flagged },
    }
  }

  return { status: 'passed', categories: [], reasons: [], raw: { blocked: [], flagged: [] } }
}

export async function moderateText(text: string): Promise<ModerationOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !text.trim()) {
    return { status: 'passed', categories: [], reasons: [], raw: { skipped: true } }
  }

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text.slice(0, 8000),
    })

    const result = response.results?.[0]
    if (!result) {
      return { status: 'passed', categories: [], reasons: [], raw: { empty: true } }
    }

    const categories = Object.entries(result.categories ?? {})
      .filter(([, value]) => value === true)
      .map(([key]) => key)

    if (result.flagged) {
      return {
        status: 'blocked',
        categories,
        reasons: ['Content was flagged by automated safety moderation.'],
        raw: { categories: result.categories, scores: result.category_scores },
      }
    }

    return { status: 'passed', categories: [], reasons: [], raw: { flagged: false } }
  } catch (error) {
    // Moderation being unavailable must not silently open the gate, but it also
    // must not break listing creation — flag for human review instead.
    console.error('[ai-moderation] moderation call failed', error)
    return {
      status: 'flagged',
      categories: ['moderation_unavailable'],
      reasons: ['Automated moderation was unavailable; this draft is flagged for review.'],
      raw: { error: error instanceof Error ? error.message : 'unknown' },
    }
  }
}

const SEVERITY_ORDER: Record<ModerationStatus, number> = { passed: 0, flagged: 1, blocked: 2 }

export function mergeModeration(...outcomes: ModerationOutcome[]): ModerationOutcome {
  return outcomes.reduce<ModerationOutcome>(
    (worst, outcome) =>
      SEVERITY_ORDER[outcome.status] > SEVERITY_ORDER[worst.status]
        ? {
            status: outcome.status,
            categories: [...new Set([...worst.categories, ...outcome.categories])],
            reasons: [...worst.reasons, ...outcome.reasons],
            raw: { ...worst.raw, ...outcome.raw },
          }
        : {
            ...worst,
            categories: [...new Set([...worst.categories, ...outcome.categories])],
            reasons: [...worst.reasons, ...outcome.reasons],
            raw: { ...worst.raw, ...outcome.raw },
          },
    { status: 'passed', categories: [], reasons: [], raw: {} }
  )
}

/** Full screen for listing text: policy list first (cheap), then safety. */
export async function screenListingText(text: string): Promise<ModerationOutcome> {
  const prohibited = await screenProhibitedItems(text)
  if (prohibited.status === 'blocked') return prohibited

  const safety = await moderateText(text)
  return mergeModeration(prohibited, safety)
}

export async function recordModerationEvent(input: {
  subjectType: 'draft' | 'image_job' | 'text'
  subjectId: string | null
  userId: string | null
  provider: string
  outcome: ModerationOutcome
}): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('ai_moderation_events').insert({
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    user_id: input.userId,
    provider: input.provider,
    status: input.outcome.status,
    categories: input.outcome.categories,
    raw: { reasons: input.outcome.reasons, ...input.outcome.raw },
  } as never)

  if (error) {
    console.error('[ai-moderation] failed to record event', error.message)
  }
}
