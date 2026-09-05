import { z } from 'zod'

export const RESERVED_HANDLES = new Set(['admin', 'administrator', 'api', 'auth', 'auctioneer', 'auctions', 'community', 'consign', 'dashboard', 'explore', 'feed', 'groups', 'help', 'imaginethisauction', 'ita', 'live', 'login', 'lots', 'messages', 'moderator', 'notifications', 'org', 'settings', 'signup', 'staff', 'support', 'system'])
const uuid = z.string().uuid()
const handle = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,29}$/).refine(v => !RESERVED_HANDLES.has(v), 'This handle is reserved')
const mediaPath = z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/).nullable().optional()
export const profileSchema = z.object({
  handle, display_name: z.string().trim().min(1).max(80), bio: z.string().trim().max(500).default(''),
  city: z.string().trim().max(80).default(''), region: z.string().trim().max(80).default(''),
  interests: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
  visibility: z.enum(['public', 'followers', 'private']).default('public'), show_location: z.boolean().default(false),
  dm_policy: z.enum(['mutual', 'open', 'closed']).default('mutual'), avatar_path: mediaPath, banner_path: mediaPath,
})
export const houseSchema = z.object({
  id: uuid, slug: handle, about: z.string().trim().max(2000), categories: z.array(z.string().trim().min(1).max(40)).max(20),
  service_radius_miles: z.number().int().min(1).max(500), banner_path: mediaPath, auto_posts: z.boolean(),
})
export const postSchema = z.object({
  body: z.string().trim().min(1).max(4000), house_id: uuid.nullable().optional(),
  media_ids: z.array(uuid).max(10).default([]), lot_id: uuid.nullable().optional(), auction_id: uuid.nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  visibility: z.enum(['public', 'followers']).default('public'),
})
export const followSchema = z.object({ target_type: z.enum(['user', 'house', 'tag', 'auction']), target_id: uuid, following: z.boolean() })
export const commentSchema = z.object({ post_id: uuid, parent_id: uuid.nullable().optional(), body: z.string().trim().min(1).max(2000) })
export const REACTIONS = ['like', 'love', 'celebrate', 'wow', 'laugh', 'want'] as const
export const reactionSchema = z.object({ post_id: uuid, kind: z.enum(REACTIONS), active: z.boolean().default(true) })
export const reportSchema = z.object({ subject_type: z.enum(['user', 'post', 'comment']), subject_id: uuid, reason: z.string().trim().min(10).max(2000) })
export const blockSchema = z.object({ target_id: uuid, active: z.boolean() })
export const preferenceSchema = z.object({ category: z.enum(['posts', 'follows', 'replies', 'mentions', 'reactions', 'auctions']), frequency: z.enum(['instant', 'daily', 'weekly', 'off']) })
export const moderationSchema = z.object({ report_id: uuid, action: z.enum(['dismiss', 'hide', 'warn', 'suspend', 'ban', 'restore']), reason: z.string().trim().min(5).max(1000) })

export interface FeedCandidate {
  id: string; published_at: string | null; followed?: boolean; categoryAffinity?: number; distanceMiles?: number | null
}
export function feedScore(item: FeedCandidate, now: number): number {
  const published = Date.parse(item.published_at ?? '')
  if (!Number.isFinite(published) || published > now) return 0
  const hours = (now - published) / 3_600_000
  const distance = item.distanceMiles == null || !Number.isFinite(item.distanceMiles) ? 0 : 1 / (1 + Math.max(0, item.distanceMiles) / 25)
  const affinity = 1 + (item.followed ? 3 : 0) + Math.max(0, Math.min(1, item.categoryAffinity ?? 0)) * 2 + distance
  return Math.pow(0.5, hours / 24) * affinity
}
export function rankFeed<T extends FeedCandidate>(items: T[], mode: 'latest' | 'for-you', now = Date.now()): T[] {
  return items.filter(p => feedScore(p, now) > 0).sort((a, b) =>
    (mode === 'latest' ? Date.parse(b.published_at!) - Date.parse(a.published_at!) : feedScore(b, now) - feedScore(a, now)) || a.id.localeCompare(b.id))
}
export function extractMentions(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/(?:^|\s)@([a-z0-9][a-z0-9_]{2,29})\b/gi), m => m[1].toLowerCase()))].slice(0, 20)
}
export function extractTags(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/(?:^|\s)#([a-z0-9][a-z0-9-]{1,39})\b/gi), m => m[1].toLowerCase()))].slice(0, 20)
}
export function canMessage(input: { blocked: boolean; house: boolean; mutual: boolean; policy: 'open' | 'closed' | 'mutual' }): boolean {
  return !input.blocked && input.policy !== 'closed' && (input.house || input.mutual || input.policy === 'open')
}
export function reputationTier(input: { paid: number; late: number; failed: number; disputes: number; ageDays: number; verifiedCard: boolean }): 'New' | 'Trusted' | 'Established' | 'Whale' {
  if (!input.verifiedCard || input.paid < 1 || input.disputes > 0 || input.failed > 0) return 'New'
  const paidOnTime = Math.max(0, input.paid - input.late * 3)
  if (paidOnTime >= 100 && input.ageDays >= 180) return 'Whale'
  if (paidOnTime >= 10 && input.ageDays >= 30) return 'Established'
  return 'Trusted'
}

export type CommunityProfile = z.infer<typeof profileSchema> & { user_id: string; created_at: string; updated_at: string; reputation_tier: string }
export type CommunityPost = {
  id: string; author_id: string; house_id: string | null; body: string; published_at: string | null; scheduled_at: string | null;
  moderation_status: string; visibility: string; lot_id: string | null; auction_id: string | null;
  profile?: { handle: string; display_name: string } | null; house?: { company_name: string; slug: string; is_approved: boolean } | null;
  media?: { id: string; url: string; alt_text: string }[]; reactions?: { kind: string; user_id: string }[];
  comments?: { id: string; body: string; author_id: string; parent_id: string | null; created_at: string }[];
  lot?: { id: string; title: string; current_high_bid: number } | null;
  auction?: { id: string; title: string; starts_at: string; ends_at: string; status: string } | null;
}
