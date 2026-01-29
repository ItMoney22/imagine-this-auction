import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ShippingSchema = z.object({
  tracking_number: z.string().optional(),
  shipping_notes: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const body = await request.json()

    // Validate request body
    const validation = ShippingSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { tracking_number, shipping_notes } = validation.data

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin or the auctioneer
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Get invoice and check permissions
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        lot:lots!inner(
          id,
          auction:auctions!inner(
            id,
            auctioneer:auctioneers!inner(
              id,
              user_id
            )
          )
        )
      `)
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Check permission: admin or auction owner
    if (userData.role !== 'admin' && invoice.lot.auction.auctioneer.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if invoice is already shipped
    if (invoice.is_shipped) {
      return NextResponse.json(
        { error: 'Invoice is already marked as shipped' },
        { status: 400 }
      )
    }

    // Check if invoice is paid (in escrow)
    if (!invoice.is_paid) {
      return NextResponse.json(
        { error: 'Invoice must be paid before shipping' },
        { status: 400 }
      )
    }

    // Update invoice as shipped
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        is_shipped: true,
        shipped_at: new Date().toISOString(),
        tracking_number,
        notes: shipping_notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update invoice:', updateError)
      return NextResponse.json(
        { error: 'Failed to mark invoice as shipped' },
        { status: 500 }
      )
    }

    // Call the database function to release escrow
    const { data: escrowResult, error: escrowError } = await supabase
      .rpc('release_escrow_on_shipping', { invoice_uuid: id })

    if (escrowError || !escrowResult) {
      console.error('Failed to release escrow:', escrowError)
      return NextResponse.json(
        { error: 'Failed to release escrow funds' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice marked as shipped and escrow released',
      tracking_number,
    })

  } catch (error) {
    console.error('Shipping confirmation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}