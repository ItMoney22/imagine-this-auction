import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'

// Cron entrypoint: creates 'watchlist_ending' notification rows for lots
// approaching their end time (SQL function from migration 012). The email/push
// batch crons then deliver them. Vercel crons issue GET with
// Authorization: Bearer CRON_SECRET.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Cron authorization required' }, { status: 401 })
  }

  try {
    const admin: SupabaseClient = createAdminClient()
    const { data, error } = await admin.rpc('send_watchlist_ending_alerts')

    if (error) {
      console.error('send_watchlist_ending_alerts failed:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, alerts_created: data ?? 0 })
  } catch (error) {
    console.error('Watchlist alerts cron failed:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
