import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chargeInvoice } from '@/lib/payments/invoice-charge'

/**
 * Closing an auction raises the winners' invoices and takes the first swing at
 * every card on file. A charge that declines is not an error here: the invoice
 * is left `failed` with the attempt recorded, and /api/cron/invoice-charges
 * takes the one retry before the invoice is handed to the auction house to
 * collect at pickup.
 *
 * Only the first CHARGE_INLINE_LIMIT invoices are charged in the request. The
 * rest stay `unpaid` with zero attempts, which is exactly what the cron picks
 * up after UNATTEMPTED_GRACE_MS, so a 300-lot sale cannot run the request out
 * of time and leave the auction half-closed.
 */
const CHARGE_INLINE_LIMIT = 25

export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createClient()

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

    // Check if auction exists and user has permission
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select(`
        *,
        auctioneer:auctioneers!inner(user_id)
      `)
      .eq('id', id)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // Check permission: admin or auction owner
    if (userData.role !== 'admin' && auction.auctioneer.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if auction is in a state that can be closed
    if (auction.status !== 'live' && auction.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Auction cannot be closed in current state' },
        { status: 400 }
      )
    }

    // Check if auction end time has passed (for live auctions)
    if (auction.status === 'live' && new Date() < new Date(auction.ends_at)) {
      return NextResponse.json(
        { error: 'Cannot close auction before end time' },
        { status: 400 }
      )
    }

    // Call the database function to process auction end
    const { data: result, error: processError } = await supabase
      .rpc('process_auction_end', { auction_uuid: id })

    if (processError) {
      console.error('Failed to process auction end:', processError)
      return NextResponse.json(
        { error: 'Failed to process auction end' },
        { status: 500 }
      )
    }

    if (!result?.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process auction end' },
        { status: 400 }
      )
    }

    // The auction is closed at this point; nothing below may change that.
    const invoiceIds: string[] = Array.isArray(result.invoice_ids) ? result.invoice_ids : []
    const charges: { invoiceId: string; outcome: string }[] = []
    for (const invoiceId of invoiceIds.slice(0, CHARGE_INLINE_LIMIT)) {
      try {
        const charge = await chargeInvoice(invoiceId)
        charges.push({ invoiceId, outcome: charge.outcome })
      } catch (error) {
        // A gateway outage must not fail the close. The invoice keeps whatever
        // state chargeInvoice left it in and the cron comes back to it.
        console.error('[auction-close] charge threw', { invoiceId, error })
        charges.push({ invoiceId, outcome: 'error' })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Auction closed successfully',
      processed_lots: result.processed_lots,
      charges,
      charges_deferred: Math.max(0, invoiceIds.length - charges.length),
    })

  } catch (error) {
    console.error('Auction close API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}