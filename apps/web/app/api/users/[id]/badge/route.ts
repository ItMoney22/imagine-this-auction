import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bidder_stats')
    .select('tier, lots_won, lifetime_spend_cents')
    .eq('user_id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ tier: null, lots_won: 0 })
  }

  return NextResponse.json({
    tier: data.tier,
    lots_won: data.lots_won,
    lifetime_spend_cents: data.lifetime_spend_cents,
  })
}
