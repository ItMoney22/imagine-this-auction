import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse, requireAuctioneer } from '@/lib/ai/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** Poll a presentation-image job (generation runs inline, but long provider
 *  waits can still leave the client without a response). */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('ai_image_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`Failed to load job: ${error.message}`)
    if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const job = data as Record<string, unknown>

    if (job.auctioneer_id !== guard.context.auctioneerId && guard.context.role !== 'admin') {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    let image = null
    if (job.result_image_id) {
      const { data: imageRow } = await admin
        .from('lot_images')
        .select('*')
        .eq('id', job.result_image_id as string)
        .maybeSingle()

      image = imageRow
    }

    return NextResponse.json({ job, image })
  } catch (error) {
    return errorResponse(error, 'Failed to load image job')
  }
}
