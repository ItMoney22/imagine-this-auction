import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { draftToLotPayload } from '@/lib/ai/draft'
import { assertOwnsAuction, errorResponse, loadOwnedDraft, requireAuctioneer } from '@/lib/ai/guard'
import {
  AI_IMAGE_DISCLOSURE,
  DraftApproveSchema,
  resolvedDraftValues,
  type DraftSuggestion,
} from '@/lib/ai/quick-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

const MAX_LOT_NUMBER_ATTEMPTS = 5

/**
 * The only path from draft to published lot.
 *
 * An AI draft never becomes a lot on its own: this route requires an
 * authenticated auctioneer who owns the target auction AND an explicit
 * `confirmed_reviewed` acknowledgement from the review screen.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response
    const { context } = guard

    const parsed = DraftApproveSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Review and confirm the draft before publishing it.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }
    const body = parsed.data

    const owned = await loadOwnedDraft(id, context)
    if (!owned.ok) return owned.response
    const draft = owned.draft

    if (draft.status === 'approved' && draft.lot_id) {
      return NextResponse.json(
        { error: 'This draft has already been published.', lot_id: draft.lot_id },
        { status: 409 }
      )
    }
    if (draft.status === 'blocked') {
      return NextResponse.json(
        { error: 'This draft was blocked by the prohibited items check and cannot be published.' },
        { status: 422 }
      )
    }
    if (draft.status === 'discarded') {
      return NextResponse.json({ error: 'This draft was discarded.' }, { status: 409 })
    }
    if (draft.moderation_status === 'blocked') {
      return NextResponse.json(
        { error: 'This draft failed content moderation and cannot be published.' },
        { status: 422 }
      )
    }

    const auctionCheck = await assertOwnsAuction(body.auction_id, context)
    if (!auctionCheck.ok) return auctionCheck.response

    const auctionStatus = auctionCheck.auction.status as string
    if (auctionStatus === 'ended' || auctionStatus === 'completed') {
      return NextResponse.json(
        { error: 'That auction has already ended — choose an open auction.' },
        { status: 400 }
      )
    }

    // ---- Resolve final field values (auctioneer edits win) -----------------
    const values = resolvedDraftValues(
      draft as unknown as { suggested: Partial<DraftSuggestion>; edits: Record<string, unknown> }
    )

    const missing: string[] = []
    if (!values.title?.trim()) missing.push('title')
    if (!values.description?.trim()) missing.push('description')
    if (!values.suggested_starting_bid || values.suggested_starting_bid <= 0) {
      missing.push('starting bid')
    }

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Complete these fields before publishing: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    if (
      values.estimate_low != null &&
      values.estimate_high != null &&
      values.estimate_high < values.estimate_low
    ) {
      return NextResponse.json(
        { error: 'The high estimate must be at least the low estimate.' },
        { status: 400 }
      )
    }

    const reservePrice = body.reserve_price ?? null
    if (reservePrice != null && reservePrice < (values.suggested_starting_bid ?? 0)) {
      // Mirrors the lots.valid_reserve CHECK constraint so the failure is a
      // readable message rather than a database error.
      return NextResponse.json(
        { error: 'The reserve price cannot be below the starting bid.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // ---- Verified originals become the lot's images -----------------------
    const { data: imageRows, error: imageError } = await admin
      .from('lot_images')
      .select('id, kind, public_url, position')
      .eq('draft_id', id)
      .order('position', { ascending: true })

    if (imageError) throw new Error(`Failed to load draft images: ${imageError.message}`)

    const allImages = (imageRows ?? []) as Array<{
      id: string
      kind: 'original' | 'ai_generated'
      public_url: string
      position: number
    }>

    const originals = allImages.filter((image) => image.kind === 'original')
    const generated = allImages.filter((image) => image.kind === 'ai_generated')

    if (originals.length === 0) {
      return NextResponse.json(
        {
          error:
            'A lot needs at least one verified original photo. AI mockups cannot stand in for the real item.',
        },
        { status: 400 }
      )
    }

    // ---- Create the lot ----------------------------------------------------
    const aiMetadata = {
      source: 'quick-list',
      draft_id: id,
      capture_mode: draft.capture_mode,
      scan_value: draft.scan_value,
      scan_format: draft.scan_format,
      confidence: draft.confidence,
      confidence_reasons: draft.confidence_reasons,
      selected_candidate_index: draft.selected_candidate_index,
      keywords: values.keywords ?? [],
      brand: values.brand ?? null,
      model: values.model ?? null,
      attributes: values.attributes ?? {},
      condition_grade: values.condition_grade ?? null,
      edited_fields: Object.keys((draft.edits ?? {}) as Record<string, unknown>),
      generated_with_model:
        (draft.suggested as Record<string, unknown> | null)?.generated_with_model ?? null,
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      ai_image_count: generated.length,
    }

    let lotId: string | null = null
    let lotNumber = 0
    let lastError: string | null = null

    // `lots` has UNIQUE(auction_id, lot_number); batch approvals race for the
    // next number, so retry on collision instead of failing the approval.
    for (let attempt = 0; attempt < MAX_LOT_NUMBER_ATTEMPTS; attempt += 1) {
      const { data: latestLot } = await admin
        .from('lots')
        .select('lot_number')
        .eq('auction_id', body.auction_id)
        .order('lot_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      lotNumber = ((latestLot as { lot_number: number } | null)?.lot_number ?? 0) + 1 + attempt

      const payload = draftToLotPayload({
        auctionId: body.auction_id,
        lotNumber,
        values,
        imageUrls: originals.map((image) => image.public_url),
        increment: body.increment,
        reservePrice,
        aiMetadata,
      })

      const { data: lot, error: lotError } = await admin
        .from('lots')
        .insert(payload as never)
        .select('id, lot_number')
        .single()

      if (!lotError && lot) {
        lotId = (lot as { id: string }).id
        lotNumber = (lot as { lot_number: number }).lot_number
        break
      }

      lastError = lotError?.message ?? 'unknown error'
      if (!lastError.toLowerCase().includes('unique')) break
    }

    if (!lotId) {
      throw new Error(`Failed to create lot: ${lastError ?? 'unknown error'}`)
    }

    // ---- Attach imagery to the lot ----------------------------------------
    // Originals first and flagged primary; generated images follow, and only if
    // the auctioneer opted to carry them over.
    const { error: attachOriginalsError } = await admin
      .from('lot_images')
      .update({ lot_id: lotId } as never)
      .eq('draft_id', id)
      .eq('kind', 'original')

    if (attachOriginalsError) {
      console.error('[quick-list] failed to attach originals', attachOriginalsError.message)
    }

    await admin
      .from('lot_images')
      .update({ is_primary: true } as never)
      .eq('id', originals[0].id)

    if (body.include_ai_images && generated.length > 0) {
      const { error: attachGeneratedError } = await admin
        .from('lot_images')
        .update({ lot_id: lotId, disclosure_label: AI_IMAGE_DISCLOSURE } as never)
        .eq('draft_id', id)
        .eq('kind', 'ai_generated')

      if (attachGeneratedError) {
        console.error('[quick-list] failed to attach ai images', attachGeneratedError.message)
      }
    }

    // ---- Close out the draft + link the audit trail to the lot ------------
    const { data: updatedDraft, error: draftUpdateError } = await admin
      .from('ai_quick_list_drafts')
      .update({
        status: 'approved',
        lot_id: lotId,
        auction_id: body.auction_id,
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
      } as never)
      .eq('id', id)
      .select('*')
      .single()

    if (draftUpdateError) {
      console.error('[quick-list] draft approved but not marked', draftUpdateError.message)
    }

    await admin
      .from('ai_credit_ledger')
      .update({ lot_id: lotId } as never)
      .eq('draft_id', id)

    await admin.from('ai_image_jobs').update({ lot_id: lotId } as never).eq('draft_id', id)

    return NextResponse.json({
      ok: true,
      lot_id: lotId,
      lot_number: lotNumber,
      auction_id: body.auction_id,
      draft: updatedDraft,
      original_image_count: originals.length,
      ai_image_count: body.include_ai_images ? generated.length : 0,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to publish this draft')
  }
}
