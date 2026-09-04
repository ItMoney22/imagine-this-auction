import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  beginAiAction,
  checkAiRateLimit,
  getAiActionPrice,
  getAvailableCredits,
  settleAiAction,
  voidAiAction,
} from '@/lib/ai/credits'
import { assertOwnsAuction, errorResponse, requireAuctioneer } from '@/lib/ai/guard'
import { identifyItem } from '@/lib/ai/identify'
import { recordModerationEvent, screenListingText } from '@/lib/ai/moderation'
import {
  IdentifyRequestSchema,
  needsCandidateSelection,
  ORIGINAL_IMAGE_BUCKET,
} from '@/lib/ai/quick-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTION_KEY = 'quick_list_identify'

/**
 * Step 1 of Quick List: scan or photograph an item and get candidate matches.
 *
 * Credits are reserved up front (so two concurrent scans can't overdraw) but
 * only actually deducted once identification returns a usable result.
 */
export async function POST(request: NextRequest) {
  let ledgerId: string | null = null

  try {
    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response
    const { context } = guard

    const parsed = IdentifyRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const body = parsed.data
    const admin = createAdminClient()

    if (body.auction_id) {
      const auctionCheck = await assertOwnsAuction(body.auction_id, context)
      if (!auctionCheck.ok) return auctionCheck.response
    }

    const price = await getAiActionPrice(ACTION_KEY)
    if (!price) {
      return NextResponse.json({ error: 'AI identification is not configured' }, { status: 503 })
    }
    if (!price.is_enabled) {
      return NextResponse.json(
        { error: 'AI identification is currently disabled by the platform admin' },
        { status: 503 }
      )
    }

    // ---- Replay protection -------------------------------------------------
    // A repeated idempotency key means the auctioneer double-tapped or the
    // network retried. Return the original draft rather than charging again.
    const { data: existingLedger } = await admin
      .from('ai_credit_ledger')
      .select('id, status, draft_id')
      .eq('user_id', context.userId)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle()

    if (existingLedger && (existingLedger as any).draft_id) {
      const { data: existingDraft } = await admin
        .from('ai_quick_list_drafts')
        .select('*')
        .eq('id', (existingLedger as any).draft_id)
        .maybeSingle()

      if (existingDraft) {
        return NextResponse.json({
          draft: existingDraft,
          duplicate: true,
          charged: (existingLedger as any).status === 'charged' ? price.credit_cost : 0,
        })
      }
    }

    const rateLimit = await checkAiRateLimit(context.userId, ACTION_KEY, price.rate_limit_per_hour)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached: ${rateLimit.limit} identifications per hour.`,
          code: 'rate_limited',
          used: rateLimit.used,
          limit: rateLimit.limit,
        },
        { status: 429, headers: { 'Retry-After': '600' } }
      )
    }

    const available = await getAvailableCredits(context.userId)
    if (available < price.credit_cost) {
      return NextResponse.json(
        {
          error: 'Not enough ITC credits for this action',
          code: 'insufficient_credits',
          credit_cost: price.credit_cost,
          available,
        },
        { status: 402 }
      )
    }

    // ---- Create the draft shell -------------------------------------------
    const captureMode =
      body.scan_value && body.images.length > 0
        ? 'hybrid'
        : body.scan_value
          ? 'barcode'
          : 'photo'

    const { data: draftRow, error: draftError } = await admin
      .from('ai_quick_list_drafts')
      .insert({
        auctioneer_id: context.auctioneerId,
        created_by: context.userId,
        auction_id: body.auction_id ?? null,
        status: 'identifying',
        capture_mode: captureMode,
        scan_value: body.scan_value ?? null,
        manual_context: body.manual_context ?? null,
      } as never)
      .select('*')
      .single()

    if (draftError || !draftRow) {
      throw new Error(`Failed to create draft: ${draftError?.message ?? 'unknown error'}`)
    }

    const draftId = (draftRow as any).id as string

    // ---- Record the verified originals ------------------------------------
    // These rows are the buyer's source of truth. They are written before any
    // AI runs and are never modified afterwards.
    if (body.images.length > 0) {
      const imageRows = body.images.map((image, index) => ({
        draft_id: draftId,
        kind: 'original' as const,
        bucket: image.bucket || ORIGINAL_IMAGE_BUCKET,
        storage_path: image.storage_path,
        public_url: image.public_url,
        position: index,
        is_primary: false,
        checksum_sha256: image.checksum_sha256,
        byte_size: image.byte_size,
        mime_type: image.mime_type,
        width: image.width,
        height: image.height,
        created_by: context.userId,
      }))

      const { error: imageError } = await admin.from('lot_images').insert(imageRows as never)
      if (imageError) {
        throw new Error(`Failed to record original photos: ${imageError.message}`)
      }
    }

    // ---- Reserve credits ---------------------------------------------------
    const reservation = await beginAiAction({
      userId: context.userId,
      actionKey: ACTION_KEY,
      idempotencyKey: body.idempotency_key,
      auctioneerId: context.auctioneerId,
      draftId,
      requestMetadata: {
        capture_mode: captureMode,
        scan_value: body.scan_value ?? null,
        image_count: body.images.length,
      },
    })

    if (!reservation.ok) {
      await admin
        .from('ai_quick_list_drafts')
        .update({ status: 'failed', error_message: reservation.message } as never)
        .eq('id', draftId)

      return NextResponse.json(
        { error: reservation.message, code: reservation.code, credit_cost: reservation.creditCost },
        { status: reservation.code === 'insufficient_credits' ? 402 : 400 }
      )
    }

    ledgerId = reservation.ledgerId

    // ---- Identify ----------------------------------------------------------
    const identification = await identifyItem({
      scanValue: body.scan_value,
      imageUrls: body.images.map((image) => image.public_url),
      manualContext: body.manual_context,
      openAiApiKey: process.env.OPENAI_API_KEY,
      visionModel: price.model,
    })

    if (identification.sources.length > 0) {
      await admin.from('ai_listing_sources').insert(
        identification.sources.map((source) => ({
          draft_id: draftId,
          source_type: source.source_type,
          provider: source.provider,
          query: source.query,
          matched: source.matched,
          confidence: source.confidence,
          payload: source.payload as never,
          latency_ms: source.latency_ms,
          error: source.error,
        })) as never
      )
    }

    // Nothing identified at all → the auctioneer gets nothing of value, so they
    // pay nothing. The draft survives so they can add photos and retry.
    if (identification.candidates.length === 0) {
      await voidAiAction(ledgerId, 'no_candidates_identified')
      ledgerId = null

      await admin
        .from('ai_quick_list_drafts')
        .update({
          status: 'capturing',
          candidates: [] as never,
          error_message:
            'No match found. Add clearer photos of the item, its label or its markings, or enter the details manually.',
        } as never)
        .eq('id', draftId)

      return NextResponse.json(
        {
          draft_id: draftId,
          candidates: [],
          charged: 0,
          error:
            'No match found. Add clearer photos of the item, its label or its markings, or enter the details manually.',
        },
        { status: 200 }
      )
    }

    // ---- Prohibited items / moderation ------------------------------------
    const screenText = [
      identification.candidates.map((c) => `${c.title} ${c.brand ?? ''} ${c.summary}`).join(' '),
      identification.ocrText ?? '',
      identification.visionSummary ?? '',
      body.manual_context ?? '',
    ].join(' ')

    const moderation = await screenListingText(screenText)
    await recordModerationEvent({
      subjectType: 'draft',
      subjectId: draftId,
      userId: context.userId,
      provider: 'internal+openai',
      outcome: moderation,
    })

    if (moderation.status === 'blocked') {
      // Blocked on policy grounds: no charge. The auctioneer got no listing.
      await voidAiAction(ledgerId, 'prohibited_item')
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
          error_message: moderation.reasons[0] ?? 'This item cannot be listed on the platform.',
        } as never)
        .eq('id', draftId)

      return NextResponse.json(
        {
          error: 'This item appears to be prohibited and cannot be listed.',
          code: 'prohibited_item',
          reasons: moderation.reasons,
          categories: moderation.categories,
          draft_id: draftId,
          charged: 0,
        },
        { status: 422 }
      )
    }

    const requiresSelection = needsCandidateSelection(identification.candidates)
    const topConfidence = identification.candidates[0]?.confidence ?? null

    const { data: updatedDraft, error: updateError } = await admin
      .from('ai_quick_list_drafts')
      .update({
        status: requiresSelection ? 'needs_selection' : 'draft_ready',
        scan_format: identification.scan?.format ?? null,
        candidates: identification.candidates as never,
        selected_candidate_index: requiresSelection ? null : 0,
        confidence: topConfidence,
        confidence_reasons: buildConfidenceReasons(identification, requiresSelection) as never,
        moderation_status: moderation.status,
        moderation_result: {
          categories: moderation.categories,
          reasons: moderation.reasons,
        } as never,
        suggested: {
          ocr_text: identification.ocrText,
          visual_summary: identification.visionSummary,
        } as never,
        error_message: null,
      } as never)
      .eq('id', draftId)
      .select('*')
      .single()

    if (updateError) throw new Error(`Failed to save candidates: ${updateError.message}`)

    const settlement = await settleAiAction({
      ledgerId,
      provider: 'openai',
      resultMetadata: {
        candidate_count: identification.candidates.length,
        top_confidence: topConfidence,
        requires_selection: requiresSelection,
        sources: identification.sources.map((s) => ({
          provider: s.provider,
          matched: s.matched,
        })),
      },
    })
    ledgerId = null

    return NextResponse.json({
      draft: updatedDraft,
      draft_id: draftId,
      candidates: identification.candidates,
      requires_selection: requiresSelection,
      moderation: {
        status: moderation.status,
        reasons: moderation.reasons,
      },
      charged: settlement.charged,
      balance_after: settlement.balanceAfter,
    })
  } catch (error) {
    if (ledgerId) {
      await voidAiAction(ledgerId, error instanceof Error ? error.message : 'identify_failed')
    }

    return errorResponse(error, 'Item identification failed')
  }
}

function buildConfidenceReasons(
  identification: Awaited<ReturnType<typeof identifyItem>>,
  requiresSelection: boolean
): string[] {
  const reasons: string[] = []

  const catalogMatch = identification.sources.find(
    (s) => s.matched && (s.source_type === 'barcode' || s.source_type === 'isbn')
  )

  if (catalogMatch) {
    reasons.push(`Matched in ${catalogMatch.provider} by scanned code.`)
  } else if (identification.scan) {
    reasons.push('The scanned code returned no catalog match.')
  }

  if (identification.scan && !identification.scan.checksumValid) {
    reasons.push('The scanned code failed its checksum — it may have been misread.')
  }

  if (identification.candidates.some((c) => c.source.includes('+'))) {
    reasons.push('Catalog data and the photos agree on the item.')
  }

  if (requiresSelection) {
    reasons.push('More than one plausible match — select the correct item.')
  }

  return reasons.slice(0, 8)
}
