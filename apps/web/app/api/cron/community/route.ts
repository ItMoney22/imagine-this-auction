import { NextRequest } from 'next/server'
import { adminRpc } from '@/lib/supabase/admin'
import { noStore } from '@/lib/community/server'

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return noStore({ error: 'Unauthorized' }, 401)
  const { data, error } = await adminRpc('community_maintenance', {})
  if (error) return noStore({ error: 'Community maintenance failed.' }, 500)
  const announcements = await adminRpc('community_auction_announcements', {})
  if (announcements.error) return noStore({ error: 'Auction announcements failed.' }, 500)
  return noStore({ maintenance: data, announcements: announcements.data })
}
