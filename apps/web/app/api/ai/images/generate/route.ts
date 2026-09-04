import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  beginAiAction,
  checkAiRateLimit,
  getAiActionPrice,
  settleAiAction,
  voidAiAction,
} from '@/lib/ai/credits'
import { errorResponse, requireAuctioneer, type AuctioneerContext } from '@/lib/ai/guard'
import {
  buildImagePrompt,
  fetchGeneratedImage,
  generatePresentationImage,
  generatedImagePath,
  ImageProviderNotConfiguredError,
} from '@/lib/ai/images'
import { recordModerationEvent, screenListingText } from '@/lib/ai/moderation'
import {
  AI_IMAGE_BUCKET,
  AI_IMAGE_DISCLOSURE,
  IMAGE_NEGATIVE_PROMPT,
  IMAGE_VARIANT_ACTION,
  ImageGenerateRequestSchema,
  resolvedDraftValues,
  type DraftSuggestion,
} from '@/lib/ai/quick-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Buy an AI presentation image with ITC credits.
 *
 * The source is always a *verified original* photo, the prompt always carries
 * the integrity rules, and the output is written to its own bucket and marked
 * `kind='ai_generated'` with the disclosure label attached. It can never
 * become the lot's primary image (database trigger enforces that too).
 */
export async function POST(request: NextRequest) {
  let ledgerId: string | null = null
  let jobId: string | null = null

  try {
    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response
    const { context } = guard

    const parsed = ImageGenerateRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const body = parsed.data

    if (!body.draft_id && !body.lot_id) {
      return NextResponse.json(
        { error: 'Provide either draft_id or lot_id' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const actionKey = IMAGE_VARIANT_ACTION[body.variant]

    // ---- Replay protection -------------------------------------------------
    const { data: existingJob } = await admin
      .from('ai_image_jobs')
      .select('*')
      .eq('created_by', context.userId)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle()

    if (existingJob) {
      const job = existingJob as Record<string, unknown>

      if (job.status === 'succeeded' && job.result_image_id) {
        const { data: image } = await admin
          .from('lot_images')
          .select('*')
          .eq('id', job.result_image_id as string)
          .maybeSingle()

        return NextResponse.json({ job, image, duplicate: true, charged: 0 })
      }

      if (job.status === 'queued' || job.status === 'running') {
        return NextResponse.json({ job, duplicate: true, charged: 0 }, { status: 202 })
      }
    }

    const price = await getAiActionPrice(actionKey)
    if (!price || !price.is_enabled) {
      return NextResponse.json(
        { error: 'This image tool is currently unavailable' },
        { status: 503 }
      )
    }

    const rateLimit = await checkAiRateLimit(context.userId, actionKey, price.rate_limit_per_hour)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Rate limit reached: ${rateLimit.limit} images per hour.`, code: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '600' } }
      )
    }

    // ---- Source must be a verified original the caller owns ----------------
    const source = await loadOwnedOriginal(body.source_image_id, context, {
      draftId: body.draft_id,
      lotId: body.lot_id,
    })

    if (!source.ok) return source.response

    const { item, targetId, targetKind } = source

    if (source.image.kind !== 'original') {
      // Generating from a generated image compounds drift away from the item.
      return NextResponse.json(
        { error: 'Presentation images must be generated from a verified original photo.' },
        { status: 400 }
      )
    }

    const prompt = buildImagePrompt(
      body.variant,
      {
        title: item.title,
        category: item.category,
        brand: item.brand,
        conditionNotes: item.conditionNotes,
      },
      body.scene_hint
    )

    // A scene hint is free text from the auctioneer — screen it before it
    // reaches the provider.
    if (body.scene_hint?.trim()) {
      const hintModeration = await screenListingText(body.scene_hint)
      if (hintModeration.status === 'blocked') {
        return NextResponse.json(
          { error: 'That scene description was rejected by content moderation.', charged: 0 },
          { status: 422 }
        )
      }
    }

    // ---- Create the job row ------------------------------------------------
    const { data: jobRow, error: jobError } = await admin
      .from('ai_image_jobs')
      .insert({
        auctioneer_id: context.auctioneerId,
        created_by: context.userId,
        draft_id: body.draft_id ?? null,
        lot_id: body.lot_id ?? null,
        action_key: actionKey,
        variant: body.variant,
        status: 'running',
        source_image_url: source.image.public_url,
        source_image_id: source.image.id,
        prompt,
        negative_prompt: IMAGE_NEGATIVE_PROMPT,
        provider: price.provider ?? 'replicate',
        model: price.model,
        idempotency_key: body.idempotency_key,
      } as never)
      .select('*')
      .single()

    if (jobError || !jobRow) {
      throw new Error(`Failed to create image job: ${jobError?.message ?? 'unknown error'}`)
    }

    jobId = (jobRow as { id: string }).id

    // ---- Reserve credits ---------------------------------------------------
    const reservation = await beginAiAction({
      userId: context.userId,
      actionKey,
      idempotencyKey: body.idempotency_key,
      auctioneerId: context.auctioneerId,
      draftId: body.draft_id ?? null,
      lotId: body.lot_id ?? null,
      imageJobId: jobId,
      requestMetadata: { variant: body.variant, source_image_id: source.image.id },
    })

    if (!reservation.ok) {
      await admin
        .from('ai_image_jobs')
        .update({ status: 'failed', error_message: reservation.message } as never)
        .eq('id', jobId)

      return NextResponse.json(
        { error: reservation.message, code: reservation.code, credit_cost: reservation.creditCost },
        { status: reservation.code === 'insufficient_credits' ? 402 : 400 }
      )
    }
    ledgerId = reservation.ledgerId

    // ---- Generate ----------------------------------------------------------
    const generation = await generatePresentationImage({
      variant: body.variant,
      sourceImageUrl: source.image.public_url,
      prompt,
      provider: price.provider,
      model: price.model,
      idempotencyKey: body.idempotency_key,
    })

    const fetched = await fetchGeneratedImage(generation.imageUrl)

    const storagePath = generatedImagePath(
      context.auctioneerId,
      targetId,
      body.variant,
      fetched.contentType
    )

    const { error: uploadError } = await admin.storage
      .from(AI_IMAGE_BUCKET)
      .upload(storagePath, fetched.bytes, {
        contentType: fetched.contentType,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) throw new Error(`Failed to store generated image: ${uploadError.message}`)

    const { data: publicUrlData } = admin.storage.from(AI_IMAGE_BUCKET).getPublicUrl(storagePath)

    const { data: nextPosition } = await admin
      .from('lot_images')
      .select('position')
      .eq(targetKind === 'draft' ? 'draft_id' : 'lot_id', targetId)
      .eq('kind', 'ai_generated')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: imageRow, error: imageError } = await admin
      .from('lot_images')
      .insert({
        lot_id: body.lot_id ?? null,
        draft_id: body.draft_id ?? null,
        kind: 'ai_generated',
        bucket: AI_IMAGE_BUCKET,
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        position: ((nextPosition as { position: number } | null)?.position ?? -1) + 1,
        is_primary: false,
        byte_size: fetched.byteSize,
        mime_type: fetched.contentType,
        variant: body.variant,
        source_image_id: source.image.id,
        prompt,
        negative_prompt: IMAGE_NEGATIVE_PROMPT,
        provider: generation.provider,
        model: generation.model,
        provider_job_id: generation.providerJobId,
        image_job_id: jobId,
        generation_metadata: {
          ...generation.raw,
          scene_hint: body.scene_hint ?? null,
          integrity_rules_applied: true,
        } as never,
        disclosure_label: AI_IMAGE_DISCLOSURE,
        moderation_status: 'passed',
        credit_ledger_id: ledgerId,
        created_by: context.userId,
      } as never)
      .select('*')
      .single()

    if (imageError) throw new Error(`Failed to record generated image: ${imageError.message}`)

    const imageId = (imageRow as { id: string }).id

    await admin
      .from('ai_image_jobs')
      .update({
        status: 'succeeded',
        provider_job_id: generation.providerJobId,
        result_image_id: imageId,
        provider_payload: generation.raw as never,
        moderation_status: 'passed',
        completed_at: new Date().toISOString(),
      } as never)
      .eq('id', jobId)

    await recordModerationEvent({
      subjectType: 'image_job',
      subjectId: jobId,
      userId: context.userId,
      provider: generation.provider,
      outcome: { status: 'passed', categories: [], reasons: [], raw: { variant: body.variant } },
    })

    const settlement = await settleAiAction({
      ledgerId,
      provider: generation.provider,
      providerJobId: generation.providerJobId,
      resultMetadata: {
        variant: body.variant,
        image_id: imageId,
        byte_size: fetched.byteSize,
      },
    })
    ledgerId = null

    return NextResponse.json({
      job: { id: jobId, status: 'succeeded', variant: body.variant },
      image: imageRow,
      disclosure: AI_IMAGE_DISCLOSURE,
      charged: settlement.charged,
      balance_after: settlement.balanceAfter,
    })
  } catch (error) {
    if (ledgerId) {
      await voidAiAction(
        ledgerId,
        error instanceof Error ? error.message : 'image_generation_failed'
      )
    }

    if (jobId) {
      const admin = createAdminClient()
      await admin
        .from('ai_image_jobs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
          completed_at: new Date().toISOString(),
        } as never)
        .eq('id', jobId)
    }

    if (error instanceof ImageProviderNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: 'provider_not_configured', charged: 0 },
        { status: 503 }
      )
    }

    return errorResponse(error, 'Image generation failed')
  }
}

interface OwnedOriginalOk {
  ok: true
  image: {
    id: string
    kind: 'original' | 'ai_generated'
    public_url: string
  }
  item: {
    title: string | null
    category: string | null
    brand: string | null
    conditionNotes: string | null
  }
  targetId: string
  targetKind: 'draft' | 'lot'
}

/**
 * Resolves the source photo and confirms the caller owns the draft or lot it
 * belongs to, returning the item context used to build the prompt.
 */
async function loadOwnedOriginal(
  imageId: string,
  context: AuctioneerContext,
  target: { draftId?: string; lotId?: string }
): Promise<OwnedOriginalOk | { ok: false; response: NextResponse }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('lot_images')
    .select('id, kind, public_url, draft_id, lot_id')
    .eq('id', imageId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load source image: ${error.message}`)
  if (!data) {
    return { ok: false, response: NextResponse.json({ error: 'Source photo not found' }, { status: 404 }) }
  }

  const image = data as {
    id: string
    kind: 'original' | 'ai_generated'
    public_url: string
    draft_id: string | null
    lot_id: string | null
  }

  if (target.draftId) {
    if (image.draft_id !== target.draftId) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'That photo does not belong to this draft' }, { status: 400 }),
      }
    }

    const { data: draft } = await admin
      .from('ai_quick_list_drafts')
      .select('id, auctioneer_id, suggested, edits')
      .eq('id', target.draftId)
      .maybeSingle()

    if (!draft) {
      return { ok: false, response: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) }
    }

    const draftRow = draft as Record<string, unknown>
    if (draftRow.auctioneer_id !== context.auctioneerId && context.role !== 'admin') {
      return { ok: false, response: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) }
    }

    const values = resolvedDraftValues(
      draftRow as unknown as { suggested: Partial<DraftSuggestion>; edits: Record<string, unknown> }
    )

    return {
      ok: true,
      image,
      targetId: target.draftId,
      targetKind: 'draft',
      item: {
        title: values.title ?? null,
        category: values.category ?? null,
        brand: values.brand ?? null,
        conditionNotes: values.condition_notes ?? null,
      },
    }
  }

  const lotId = target.lotId as string

  if (image.lot_id !== lotId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'That photo does not belong to this lot' }, { status: 400 }),
    }
  }

  const { data: lot } = await admin
    .from('lots')
    .select('id, title, category, condition_report, ai_metadata, auctions!inner(auctioneer_id)')
    .eq('id', lotId)
    .maybeSingle()

  if (!lot) {
    return { ok: false, response: NextResponse.json({ error: 'Lot not found' }, { status: 404 }) }
  }

  const lotRow = lot as Record<string, any>
  const ownerAuctioneerId = lotRow.auctions?.auctioneer_id

  if (ownerAuctioneerId !== context.auctioneerId && context.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Lot not found' }, { status: 404 }) }
  }

  return {
    ok: true,
    image,
    targetId: lotId,
    targetKind: 'lot',
    item: {
      title: lotRow.title ?? null,
      category: lotRow.category ?? null,
      brand: lotRow.ai_metadata?.brand ?? null,
      conditionNotes: lotRow.condition_report ?? null,
    },
  }
}
