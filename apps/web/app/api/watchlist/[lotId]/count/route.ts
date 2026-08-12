import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  const { lotId } = await params
  const supabase = await createClient()

  // Aggregate count only — served via service role so the watchlists table
  // doesn't need a public SELECT policy (which would expose who watches what)
  const { count } = await createAdminClient()
    .from('watchlists')
    .select('*', { count: 'exact', head: true })
    .eq('lot_id', lotId)

  const { data: { user } } = await supabase.auth.getUser()
  let isWatching = false
  if (user) {
    const { data } = await supabase
      .from('watchlists')
      .select('id')
      .eq('user_id', user.id)
      .eq('lot_id', lotId)
      .maybeSingle()
    isWatching = !!data
  }

  return NextResponse.json({ count: count ?? 0, isWatching })
}
