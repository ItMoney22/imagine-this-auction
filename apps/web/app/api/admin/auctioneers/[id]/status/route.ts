import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const AuctioneerStatusSchema = z.object({
  is_approved: z.boolean(),
  notes: z.string().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const body = await request.json()

    const validation = AuctioneerStatusSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 },
      )
    }

    const { is_approved, notes } = validation.data

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: adminUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: auctioneer, error: auctioneerError } = await admin
      .from('auctioneers')
      .select('id, user_id, company_name, is_approved')
      .eq('id', id)
      .single()

    if (auctioneerError || !auctioneer) {
      return NextResponse.json({ error: 'Auctioneer application not found' }, { status: 404 })
    }

    const { data: licenseDocument, error: licenseError } = await admin
      .from('user_documents')
      .select('id')
      .eq('user_id', auctioneer.user_id)
      .eq('document_type', 'auctioneer_license')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (licenseError) {
      console.error('Failed to fetch auctioneer license document:', licenseError)
      return NextResponse.json({ error: 'Failed to verify license document' }, { status: 500 })
    }

    if (is_approved && !licenseDocument) {
      return NextResponse.json(
        { error: 'A business license upload is required before approval' },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const { error: updateAuctioneerError } = await admin
      .from('auctioneers')
      .update({
        is_approved,
        approval_date: is_approved ? now : null,
        updated_at: now,
      })
      .eq('id', id)

    if (updateAuctioneerError) {
      console.error('Failed to update auctioneer status:', updateAuctioneerError)
      return NextResponse.json({ error: 'Failed to update auctioneer status' }, { status: 500 })
    }

    const { error: updateUserError } = await admin
      .from('users')
      .update({
        role: 'auctioneer',
        is_approved,
        updated_at: now,
      })
      .eq('id', auctioneer.user_id)

    if (updateUserError) {
      console.error('Failed to update auctioneer user status:', updateUserError)
      return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 })
    }

    if (licenseDocument) {
      const { error: updateDocumentError } = await admin
        .from('user_documents')
        .update({
          verification_status: is_approved ? 'approved' : 'rejected',
          verification_notes: notes || null,
          verified_at: now,
          verified_by: user.id,
        })
        .eq('id', licenseDocument.id)

      if (updateDocumentError) {
        console.error('Failed to update license document status:', updateDocumentError)
        return NextResponse.json({ error: 'Failed to update license document status' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auctioneer ${is_approved ? 'approved' : 'rejected'} successfully`,
      old_status: auctioneer.is_approved,
      new_status: is_approved,
      company_name: auctioneer.company_name,
    })
  } catch (error) {
    console.error('Auctioneer status change API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
