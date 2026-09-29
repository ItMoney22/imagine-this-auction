import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { adminRpc } from '@/lib/supabase/admin'
import { moderateText, screenProhibitedItems } from '@/lib/ai/moderation'
import { rankFeed, type CommunityPost } from './model'

export class CommunityError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export async function context(requireUser = false) {
  const db = await createClient()
  const { data: enabled, error } = await (db as SupabaseClient).rpc('community_enabled')
  if (error) throw new CommunityError('Community is temporarily unavailable.', 503)
  if (!enabled) throw new CommunityError('Community is not available yet.', 404)
  const { data: { user } } = await db.auth.getUser()
  if (requireUser && !user) throw new CommunityError('Sign in to join the conversation.', 401)
  return { db, user }
}
export function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
}
export function failure(error: unknown) {
  if (error instanceof CommunityError) return noStore({ error: error.message }, error.status)
  if (error instanceof z.ZodError) return noStore({ error: error.issues[0]?.message ?? 'Check your input.' }, 400)
  if (error instanceof SyntaxError) return noStore({ error: 'Invalid request body.' }, 400)
  console.error('[community]', error instanceof Error ? error.message : 'Request failed')
  return noStore({ error: 'Community could not complete this request. Please try again.' }, 500)
}
export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) throw new CommunityError('Request origin is not allowed.', 403)
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw new CommunityError('Cross-site request is not allowed.', 403)
}
export async function readBody(req: NextRequest) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new CommunityError('Send JSON content.', 415)
  const text = await req.text()
  if (text.length > 16_384) throw new CommunityError('Request is too large.', 413)
  return JSON.parse(text)
}
export async function takeRate(actor: string, action: string, limit = 30, seconds = 60) {
  const { data, error } = await adminRpc<boolean>('community_take_rate', { actor, action_name: action, max_hits: limit, window_seconds: seconds })
  if (error) throw new CommunityError('Community is being prepared. Please try again later.', 503)
  if (!data) throw new CommunityError('Please wait before trying again, or contact support if your access is restricted.', 429)
}
export async function screen(text: string): Promise<'approved' | 'pending'> {
  if ((text.match(/https?:\/\/\S+/gi) ?? []).length > 5) throw new CommunityError('Please use fewer links in your post.')
  const policy = await screenProhibitedItems(text)
  if (policy.status === 'blocked') throw new CommunityError('This content does not meet the community rules.')
  // The existing listing helper permits a missing key. Public social content is held for review instead.
  if (!process.env.OPENAI_API_KEY) return 'pending'
  const outcome = await moderateText(text)
  if (outcome.status === 'blocked') throw new CommunityError('This content does not meet the community rules.')
  return policy.status === 'flagged' || outcome.status !== 'passed' || outcome.raw.skipped || outcome.raw.empty ? 'pending' : 'approved'
}
export async function command(actor: string, operation: string, payload: unknown) {
  const { data, error } = await adminRpc('community_command', { actor, operation, payload })
  if (error) {
    const message = error.message
    if (/duplicate key|unique constraint/i.test(message)) throw new CommunityError('That handle or address is already in use.', 409)
    if (/required|unavailable|restricted|Reserved|Handles can|Choose |Photos must|Reply to|Create your|not enabled|Contact support|Invalid|not available/i.test(message)) throw new CommunityError(message, 400)
    throw new Error('Community transaction failed')
  }
  return data
}
export type CommunityDb = Awaited<ReturnType<typeof createClient>>
export async function hydratePosts(db: CommunityDb, posts: CommunityPost[]) {
  if (!posts.length) return []
  const ids = posts.map(p => p.id)
  const authorIds = [...new Set(posts.map(p => p.author_id))]
  const houseIds = [...new Set(posts.flatMap(p => p.house_id ? [p.house_id] : []))]
  const lotIds = [...new Set(posts.flatMap(p => p.lot_id ? [p.lot_id] : []))]
  const auctionIds = [...new Set(posts.flatMap(p => p.auction_id ? [p.auction_id] : []))]
  const results = await Promise.all([
    db.from('community_profiles').select('user_id,handle,display_name').in('user_id', authorIds),
    db.from('community_houses').select('id,slug,company_name,is_approved').in('id', houseIds),
    db.from('community_media').select('id,post_id,path,alt_text').in('post_id', ids),
    db.from('community_reactions').select('post_id,user_id,kind').in('post_id', ids),
    db.from('community_comments').select('id,post_id,author_id,parent_id,body,created_at').in('post_id', ids).order('created_at').limit(500),
    db.from('lots').select('id,title,current_high_bid').in('id', lotIds),
    db.from('auctions').select('id,title,starts_at,ends_at,status').in('id', auctionIds),
  ])
  for (const result of results) if (result.error) throw new Error('Could not load community content')
  const profiles = results[0].data ?? []
  const houses = results[1].data ?? []
  const media = results[2].data ?? []
  const reactions = results[3].data ?? []
  const comments = results[4].data ?? []
  const lots = results[5].data ?? []
  const auctions = results[6].data ?? []
  // Media URLs point to a permission-checked endpoint, so a block/hide takes effect on the next read.
  return posts.map(p => ({ ...p,
    profile: profiles.find(a => a.user_id === p.author_id) ?? null,
    house: houses.find(h => h.id === p.house_id) ?? null,
    media: media.filter(m => m.post_id === p.id).map(m => ({ id: m.id, alt_text: m.alt_text, url: `/api/community/media/${m.id}` })),
    reactions: reactions.filter(r => r.post_id === p.id), comments: comments.filter(c => c.post_id === p.id),
    lot: lots.find(l => l.id === p.lot_id) ?? null, auction: auctions.find(a => a.id === p.auction_id) ?? null,
  }))
}
export async function loadFeed(db: CommunityDb, userId: string | undefined, params: URLSearchParams) {
  const mode = params.get('mode') === 'latest' ? 'latest' : 'for-you'
  const cursor = params.get('before')?.split('|')
  const before = cursor ? z.string().datetime({ offset: true }).parse(cursor[0]) : new Date().toISOString()
  const beforeId = cursor?.[1] ? z.string().uuid().parse(cursor[1]) : null
  const author = params.has('author') ? z.string().uuid().parse(params.get('author')) : null
  const house = params.has('house') ? z.string().uuid().parse(params.get('house')) : null
  const follows = userId ? await db.from('community_follows').select('target_type,target_id').eq('follower_id', userId).limit(1000) : { data: [], error: null }
  const mutes = userId ? await db.from('community_mutes').select('target_id').eq('user_id', userId) : { data: [], error: null }
  const interestResult = userId ? await db.from('community_profiles').select('interests').eq('user_id', userId).maybeSingle() : { data: null, error: null }
  if (follows.error || mutes.error || interestResult.error) throw new Error('Could not load feed preferences')
  let query = db.from('community_posts').select('*').eq('moderation_status', 'approved').order('published_at', { ascending: false }).order('id').limit(40)
  query = beforeId ? query.or(`published_at.lt.${before},and(published_at.eq.${before},id.gt.${beforeId})`) : query.lt('published_at', before)
  if (author) query = query.eq('author_id', author)
  if (house) query = query.eq('house_id', house)
  const result = await query
  if (result.error) throw new Error('Could not load feed')
  const base = result.data as CommunityPost[]
  const oldest = base.length === 40 ? `${base[base.length - 1].published_at}|${base[base.length - 1].id}` : null
  const followRows = follows.data ?? []
  const userFollows = followRows.filter(f => f.target_type === 'user').map(f => f.target_id)
  const houseFollows = followRows.filter(f => f.target_type === 'house').map(f => f.target_id)
  // Read-time selection also covers large accounts and follows made after publication.
  const candidates = base
  const muted = new Set((mutes.data ?? []).map(m => m.target_id))
  const interests = new Set<string>(interestResult.data?.interests ?? [])
  const ranked = rankFeed(candidates.filter(p => !muted.has(p.author_id)).map(p => ({ ...p,
    followed: userFollows.includes(p.author_id) || houseFollows.includes(p.house_id),
    categoryAffinity: [...interests].some(tag => p.body.toLowerCase().includes(`#${tag}`)) ? 1 : 0,
  })), mode)
  return { posts: await hydratePosts(db, ranked), next: oldest, mode }
}
