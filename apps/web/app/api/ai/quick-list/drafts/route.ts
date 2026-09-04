import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse, requireAuctioneer } from '@/lib/ai/guard'
import { DRAFT_STATUSES } from '@/lib/ai/quick-listing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The batch queue: this auctioneer's drafts, newest first. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response

    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const auctionId = url.searchParams.get('auction_id')
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100)

    const admin = createAdminClient()

    let query = admin
      .from('ai_quick_list_drafts')
      .select('*')
      .eq('auctioneer_id', guard.context.auctioneerId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (statusParam) {
      const statuses = statusParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => (DRAFT_STATUSES as readonly string[]).includes(s))

      if (statuses.length > 0) query = query.in('status', statuses)
    } else {
      query = query.not('status', 'in', '("discarded")')
    }

    if (auctionId) query = query.eq('auction_id', auctionId)

    const { data, error } = await query
    if (error) throw new Error(`Failed to load drafts: ${error.message}`)

    const drafts = (data ?? []) as Array<Record<string, unknown>>

    // One round trip for every draft's thumbnail rather than N.
    const draftIds = drafts.map((d) => d.id as string)
    const thumbnails = new Map<string, string>()

    if (draftIds.length > 0) {
      const { data: images } = await admin
        .from('lot_images')
        .select('draft_id, public_url, position')
        .in('draft_id', draftIds)
        .eq('kind', 'original')
        .order('position', { ascending: true })

      for (const image of (images ?? []) as Array<{ draft_id: string; public_url: string }>) {
        if (!thumbnails.has(image.draft_id)) thumbnails.set(image.draft_id, image.public_url)
      }
    }

    return NextResponse.json({
      drafts: drafts.map((draft) => ({
        ...draft,
        thumbnail_url: thumbnails.get(draft.id as string) ?? null,
      })),
    })
  } catch (error) {
    return errorResponse(error, 'Failed to load drafts')
  }
}
