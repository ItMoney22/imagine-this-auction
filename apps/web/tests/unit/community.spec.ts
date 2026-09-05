import { expect, test } from '@playwright/test'
import { canMessage, feedScore, rankFeed, profileSchema, postSchema, reactionSchema, reputationTier, extractMentions, extractTags } from '../../lib/community/model'

test('handles are normalized, reserved routes and unsafe profile links rejected', () => {
  expect(profileSchema.parse({ handle: ' Coin_Finder ', display_name: 'Collector' }).handle).toBe('coin_finder')
  for (const handle of ['admin', 'api', 'ab', 'has spaces', 'auctioneer']) {
    expect(profileSchema.safeParse({ handle, display_name: 'Collector' }).success).toBe(false)
  }
  expect(profileSchema.safeParse({ handle: 'collector', display_name: 'Collector', avatar_path: 'https://evil.test/a.png' }).success).toBe(false)
})

test('feed rewards affinity, decays predictably and never ranks future posts', () => {
  const now = Date.parse('2026-09-05T12:00:00Z')
  const post = { id: 'a', published_at: '2026-09-05T10:00:00Z', followed: false, categoryAffinity: 0, distanceMiles: null }
  expect(feedScore({ ...post, followed: true }, now)).toBeGreaterThan(feedScore(post, now))
  expect(feedScore({ ...post, distanceMiles: 5 }, now)).toBeGreaterThan(feedScore({ ...post, distanceMiles: 200 }, now))
  expect(feedScore({ ...post, published_at: 'invalid' }, now)).toBe(0)
  const recent = { ...post, id: 'b', published_at: '2026-09-05T11:00:00Z' }
  const followed = { ...post, followed: true }
  const future = { ...post, id: 'c', published_at: '2026-09-06T10:00:00Z' }
  expect(rankFeed([recent, followed, future], 'for-you', now).map(p => p.id)).toEqual(['a', 'b'])
  expect(rankFeed([followed, recent], 'latest', now).map(p => p.id)).toEqual(['b', 'a'])
})

test('composer validates bounded content, media, scheduling and reaction choices', () => {
  expect(postSchema.safeParse({ body: ' ' }).success).toBe(false)
  expect(postSchema.safeParse({ body: 'Hello', media_ids: Array(11).fill('00000000-0000-4000-8000-000000000001') }).success).toBe(false)
  expect(postSchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false)
  expect(postSchema.safeParse({ body: 'Hello', scheduled_at: 'tomorrow' }).success).toBe(false)
  expect(reactionSchema.safeParse({ post_id: '00000000-0000-4000-8000-000000000001', kind: 'script' }).success).toBe(false)
  expect(extractMentions('Hi @coins @coins and mail@host.com')).toEqual(['coins'])
  expect(extractTags('#Coins and #estate-sale #coins')).toEqual(['coins', 'estate-sale'])
})

test('DM consent and blocks cannot be bypassed by follows or house status', () => {
  expect(canMessage({ blocked: true, house: true, mutual: true, policy: 'open' })).toBe(false)
  expect(canMessage({ blocked: false, house: false, mutual: false, policy: 'mutual' })).toBe(false)
  expect(canMessage({ blocked: false, house: false, mutual: true, policy: 'mutual' })).toBe(true)
  expect(canMessage({ blocked: false, house: false, mutual: true, policy: 'closed' })).toBe(false)
})

test('reputation requires paid history and card verification; failure lowers trust', () => {
  expect(reputationTier({ paid: 100, late: 0, failed: 0, disputes: 0, ageDays: 365, verifiedCard: false })).toBe('New')
  expect(reputationTier({ paid: 1, late: 0, failed: 0, disputes: 0, ageDays: 10, verifiedCard: true })).toBe('Trusted')
  expect(reputationTier({ paid: 100, late: 0, failed: 0, disputes: 0, ageDays: 365, verifiedCard: true })).toBe('Whale')
  expect(reputationTier({ paid: 100, late: 0, failed: 0, disputes: 1, ageDays: 365, verifiedCard: true })).toBe('New')
})
