import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lotId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { max_amount } = await req.json()
  const amount = Number(max_amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'max_amount must be a positive number' }, { status: 400 })
  }

  const { data: lot, error: lotErr } = await supabase
    .from('lots')
    .select('id, current_high_bid, starting_bid, increment')
    .eq('id', lotId)
    .single()

  if (lotErr || !lot) return NextResponse.json({ error: 'Lot not found' }, { status: 404 })

  const minRequired = (lot.current_high_bid || lot.starting_bid) + (lot.increment || 1)
  if (amount < minRequired) {
    return NextResponse.json(
      { error: `Max must be at least ${minRequired}` },
      { status: 400 }
    )
  }

  const { error: upsertErr } = await supabase
    .from('max_bids')
    .upsert(
      { user_id: user.id, lot_id: lotId, max_amount: amount, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,lot_id' }
    )

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // If the user is not currently the high bidder, place an initial bid via place_bid
  // at minRequired. The DB hook in place_bid will counter from competing max_bids if any.
  const { data: highBidRow } = await supabase
    .from('bids')
    .select('bidder_id')
    .eq('lot_id', lotId)
    .order('amount', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!highBidRow || highBidRow.bidder_id !== user.id) {
    const { data: bidResult, error: bidErr } = await supabase.rpc('place_bid', {
      p_lot_id: lotId,
      p_user_id: user.id,
      p_amount: minRequired,
    })
    if (bidErr) {
      return NextResponse.json({ error: bidErr.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, max_amount: amount, initial_bid: bidResult })
  }

  return NextResponse.json({ ok: true, max_amount: amount })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lotId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('max_bids')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('lot_id', lotId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
