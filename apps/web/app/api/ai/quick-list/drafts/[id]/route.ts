import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertOwnsAuction, errorResponse, loadOwnedDraft, requireAuctioneer } from '@/lib/ai/guard'
import { DraftPatchSchema } from '@/lib/ai/quick-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** Draft plus its images, split into verified originals and AI mockups. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response

    const owned = await loadOwnedDraft(id, guard.context)
    if (!owned.ok) return owned.response

    const admin = createAdminClient()

    const [{ data: images }, { data: jobs }, { data: ledger }] = await Promise.all([
      admin
        .from('lot_images')
        .select('*')
        .eq('draft_id', id)
        .order('kind', { ascending: true })
        .order('position', { ascending: true }),
      admin
        .from('ai_image_jobs')
        .select('id, variant, status, error_message, created_at, completed_at, result_image_id')
        .eq('draft_id', id)
        .order('created_at', { ascending: false }),
      admin
        .from('ai_credit_ledger')
        .select('id, action_key, credit_cost, status, created_at, refunded_at, refund_reason')
        .eq('draft_id', id)
        .order('created_at', { ascending: false }),
    ])

    const allImages = (images ?? []) as Array<Record<string, unknown>>

    return NextResponse.json({
      draft: owned.draft,
      original_images: allImages.filter((image) => image.kind === 'original'),
      generated_images: allImages.filter((image) => image.kind === 'ai_generated'),
      image_jobs: jobs ?? [],
      credit_ledger: ledger ?? [],
    })
  } catch (error) {
    return errorResponse(error, 'Failed to load draft')
  }
}

/**
 * Auctioneer edits. Edits are stored in `edits`, separate from the AI's
 * `suggested` payload, so what the model proposed and what the human changed
 * both remain on the record.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response

    const owned = await loadOwnedDraft(id, guard.context)
    if (!owned.ok) return owned.response

    if (owned.draft.status === 'approved') {
      return NextResponse.json(
        { error: 'This draft has already been published and can no longer be edited here.' },
        { status: 409 }
      )
    }

    const parsed = DraftPatchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { auction_id, selected_candidate_index, ...fieldEdits } = parsed.data

    if (auction_id) {
      const auctionCheck = await assertOwnsAuction(auction_id, guard.context)
      if (!auctionCheck.ok) return auctionCheck.response
    }

    if (
      fieldEdits.estimate_low != null &&
      fieldEdits.estimate_high != null &&
      fieldEdits.estimate_high < fieldEdits.estimate_low
    ) {
      return NextResponse.json(
        { error: 'The high estimate must be at least the low estimate.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const existingEdits = (owned.draft.edits ?? {}) as Record<string, unknown>

    const update: Record<string, unknown> = {
      edits: { ...existingEdits, ...fieldEdits },
    }

    if (auction_id !== undefined) update.auction_id = auction_id
    if (selected_candidate_index !== undefined) {
      update.selected_candidate_index = selected_candidate_index
    }
    if (fieldEdits.suggested_starting_bid !== undefined) {
      update.suggested_starting_bid = fieldEdits.suggested_starting_bid
    }
    if (fieldEdits.suggested_duration_hours !== undefined) {
      update.suggested_duration_hours = fieldEdits.suggested_duration_hours
    }

    const { data, error } = await admin
      .from('ai_quick_list_drafts')
      .update(update as never)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw new Error(`Failed to save edits: ${error.message}`)

    return NextResponse.json({ draft: data })
  } catch (error) {
    return errorResponse(error, 'Failed to update draft')
  }
}

/** Discard a draft. Never a hard delete — the audit trail survives. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response

    const owned = await loadOwnedDraft(id, guard.context)
    if (!owned.ok) return owned.response

    if (owned.draft.status === 'approved') {
      return NextResponse.json(
        { error: 'Published drafts cannot be discarded. Remove the lot instead.' },
        { status: 409 }
      )
    }

    const admin = createAdminClient()

    const { error } = await admin
      .from('ai_quick_list_drafts')
      .update({ status: 'discarded' } as never)
      .eq('id', id)

    if (error) throw new Error(`Failed to discard draft: ${error.message}`)

    return NextResponse.json({ ok: true, status: 'discarded' })
  } catch (error) {
    return errorResponse(error, 'Failed to discard draft')
  }
}
