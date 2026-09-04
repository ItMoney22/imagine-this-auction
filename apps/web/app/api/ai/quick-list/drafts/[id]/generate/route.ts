import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  beginAiAction,
  checkAiRateLimit,
  getAiActionPrice,
  settleAiAction,
  voidAiAction,
} from '@/lib/ai/credits'
import { errorResponse, loadOwnedDraft, requireAuctioneer } from '@/lib/ai/guard'
import { generateDraftListing } from '@/lib/ai/draft'
import { normalizeAiPreferences } from '@/lib/ai/listing-assistant'
import { recordModerationEvent, screenListingText } from '@/lib/ai/moderation'
import {
  CandidateSchema,
  DraftGenerateRequestSchema,
  type ListingCandidate,
} from '@/lib/ai/quick-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTION_KEY = 'quick_list_draft'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Step 2 of Quick List: turn the selected candidate + verified photos into a
 * full draft listing. Still a draft — publishing is a separate approval.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  let ledgerId: string | null = null

  try {
    const { id } = await params

    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response
    const { context } = guard

    const parsed = DraftGenerateRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const body = parsed.data

    const owned = await loadOwnedDraft(id, context)
    if (!owned.ok) return owned.response
    const draft = owned.draft

    if (draft.status === 'blocked') {
      return NextResponse.json(
        { error: 'This draft was blocked by the prohibited items check.' },
        { status: 422 }
      )
    }
    if (draft.status === 'approved') {
      return NextResponse.json(
        { error: 'This draft has already been published as a lot.' },
        { status: 409 }
      )
    }

    const admin = createAdminClient()

    // Replay of the same key returns the stored draft, unchanged and unbilled.
    const { data: existingLedger } = await admin
      .from('ai_credit_ledger')
      .select('id, status')
      .eq('user_id', context.userId)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle()

    if (existingLedger && (existingLedger as any).status === 'charged') {
      const { data: current } = await admin
        .from('ai_quick_list_drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      return NextResponse.json({ draft: current, duplicate: true, charged: 0 })
    }

    const price = await getAiActionPrice(ACTION_KEY)
    if (!price || !price.is_enabled) {
      return NextResponse.json(
        { error: 'Draft generation is currently unavailable' },
        { status: 503 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI provider is not configured' }, { status: 503 })
    }

    const rateLimit = await checkAiRateLimit(context.userId, ACTION_KEY, price.rate_limit_per_hour)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached: ${rateLimit.limit} drafts per hour.`,
          code: 'rate_limited',
        },
        { status: 429, headers: { 'Retry-After': '600' } }
      )
    }

    // ---- Resolve the candidate the auctioneer picked -----------------------
    const rawCandidates = Array.isArray(draft.candidates) ? draft.candidates : []
    const candidates = rawCandidates
      .map((c) => CandidateSchema.safeParse(c))
      .filter((r): r is { success: true; data: ListingCandidate } => r.success)
      .map((r) => r.data)

    const candidateIndex =
      body.candidate_index ?? (draft.selected_candidate_index as number | null) ?? null

    if (candidates.length > 1 && candidateIndex == null) {
      return NextResponse.json(
        {
          error: 'Select which match is correct before generating the draft.',
          code: 'candidate_required',
          candidates,
        },
        { status: 409 }
      )
    }

    const candidate =
      candidateIndex != null && candidates[candidateIndex]
        ? candidates[candidateIndex]
        : candidates[0] ?? null

    if (candidateIndex != null && !candidates[candidateIndex]) {
      return NextResponse.json({ error: 'That match no longer exists' }, { status: 400 })
    }

    // ---- The verified originals are the visual evidence for the draft ------
    const { data: originalImages } = await admin
      .from('lot_images')
      .select('public_url')
      .eq('draft_id', id)
      .eq('kind', 'original')
      .order('position', { ascending: true })

    const imageUrls = ((originalImages ?? []) as Array<{ public_url: string }>).map(
      (row) => row.public_url
    )

    if (imageUrls.length === 0 && !candidate) {
      return NextResponse.json(
        { error: 'Add at least one photo or select a match before generating a draft.' },
        { status: 400 }
      )
    }

    const reservation = await beginAiAction({
      userId: context.userId,
      actionKey: ACTION_KEY,
      idempotencyKey: body.idempotency_key,
      auctioneerId: context.auctioneerId,
      draftId: id,
      requestMetadata: {
        candidate_index: candidateIndex,
        image_count: imageUrls.length,
      },
    })

    if (!reservation.ok) {
      return NextResponse.json(
        { error: reservation.message, code: reservation.code, credit_cost: reservation.creditCost },
        { status: reservation.code === 'insufficient_credits' ? 402 : 400 }
      )
    }
    ledgerId = reservation.ledgerId

    const preferences = normalizeAiPreferences(context.aiPreferences)
    const previous = (draft.suggested ?? {}) as Record<string, unknown>

    const { suggestion, model } = await generateDraftListing({
      candidate,
      imageUrls,
      scanValue: (draft.scan_value as string | null) ?? undefined,
      ocrText: (previous.ocr_text as string | null) ?? undefined,
      visionSummary: (previous.visual_summary as string | null) ?? undefined,
      manualContext:
        body.manual_context ?? ((draft.manual_context as string | null) ?? undefined),
      houseStyle: preferences.descriptionStyle,
      houseNotes: preferences.customNotes,
      model: price.model,
      apiKey: process.env.OPENAI_API_KEY,
    })

    // ---- Moderate the generated copy --------------------------------------
    const moderation = await screenListingText(
      [suggestion.title, suggestion.description, suggestion.condition_notes, suggestion.keywords.join(' ')].join(' ')
    )

    await recordModerationEvent({
      subjectType: 'draft',
      subjectId: id,
      userId: context.userId,
      provider: 'internal+openai',
      outcome: moderation,
    })

    if (moderation.status === 'blocked') {
      await voidAiAction(ledgerId, 'prohibited_item_in_draft')
      ledgerId = null

      await admin
        .from('ai_quick_list_drafts')
        .update({
          status: 'blocked',
          moderation_status: 'blocked',
          moderation_result: {
            categories: moderation.categories,
            reasons: moderation.reasons,
          } as never,
          error_message: moderation.reasons[0] ?? 'This item cannot be listed.',
        } as never)
        .eq('id', id)

      return NextResponse.json(
        {
          error: 'This item appears to be prohibited and cannot be listed.',
          code: 'prohibited_item',
          reasons: moderation.reasons,
          charged: 0,
        },
        { status: 422 }
      )
    }

    const { data: updated, error: updateError } = await admin
      .from('ai_quick_list_drafts')
      .update({
        status: 'draft_ready',
        selected_candidate_index: candidateIndex ?? (candidate ? 0 : null),
        suggested: {
          ...suggestion,
          // Preserve the identification trail alongside the draft copy.
          ocr_text: previous.ocr_text ?? null,
          visual_summary: previous.visual_summary ?? null,
          generated_with_model: model,
          generated_at: new Date().toISOString(),
        } as never,
        confidence: suggestion.confidence,
        confidence_reasons: [
          ...suggestion.confidence_reasons,
          ...suggestion.uncertainties.map((u) => `Verify: ${u}`),
        ].slice(0, 8) as never,
        suggested_starting_bid: suggestion.suggested_starting_bid,
        suggested_duration_hours: suggestion.suggested_duration_hours,
        moderation_status: moderation.status,
        moderation_result: {
          categories: moderation.categories,
          reasons: moderation.reasons,
        } as never,
        manual_context: body.manual_context ?? draft.manual_context,
        error_message: null,
      } as never)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) throw new Error(`Failed to save draft: ${updateError.message}`)

    const settlement = await settleAiAction({
      ledgerId,
      provider: 'openai',
      resultMetadata: {
        model,
        confidence: suggestion.confidence,
        uncertainty_count: suggestion.uncertainties.length,
      },
    })
    ledgerId = null

    return NextResponse.json({
      draft: updated,
      suggestion,
      moderation: { status: moderation.status, reasons: moderation.reasons },
      charged: settlement.charged,
      balance_after: settlement.balanceAfter,
    })
  } catch (error) {
    if (ledgerId) {
      await voidAiAction(ledgerId, error instanceof Error ? error.message : 'draft_failed')
    }

    return errorResponse(error, 'Draft generation failed')
  }
}
