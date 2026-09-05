// Community schema is kept separate so the launch database types can evolve independently.
import type { CommunityProfile, CommunityPost } from './model'

type Table<Row, Required extends keyof Row = never> = { Row: Row; Insert: Pick<Row, Required> & Partial<Row>; Update: Partial<Row>; Relationships: [] }
type Id = { id: string }
type Created = { created_at: string }
export type CommunityTables = {
  community_profiles: Table<CommunityProfile & { handle_changed_at: string }, 'user_id' | 'handle' | 'display_name'>
  community_houses: Table<Id & Created & { owner_id: string; slug: string; company_name: string; about: string; city: string; region: string; categories: string[]; service_radius_miles: number; banner_path: string | null; logo_url: string | null; is_approved: boolean; auto_posts: boolean }, 'id' | 'owner_id' | 'slug' | 'company_name'>
  house_members: Table<{ auctioneer_id: string; user_id: string; role: 'owner' | 'staff' }, 'auctioneer_id' | 'user_id' | 'role'>
  community_tags: Table<Id & { name: string }, 'name'>
  community_follows: Table<Created & { follower_id: string; target_type: 'user' | 'house' | 'tag' | 'auction'; target_id: string }, 'follower_id' | 'target_type' | 'target_id'>
  community_blocks: Table<{ user_id: string; target_id: string }, 'user_id' | 'target_id'>
  community_mutes: Table<{ user_id: string; target_id: string }, 'user_id' | 'target_id'>
  community_restrictions: Table<Created & { user_id: string; until_at: string | null; reason: string }, 'user_id' | 'reason'>
  community_posts: Table<Pick<CommunityPost, 'id' | 'author_id' | 'house_id' | 'body' | 'visibility' | 'moderation_status' | 'lot_id' | 'auction_id' | 'scheduled_at' | 'published_at'> & Created & { auto_key: string | null }, 'author_id' | 'body'>
  community_media: Table<Id & Created & { owner_id: string; post_id: string | null; path: string; content_type: string; bytes: number; alt_text: string; moderation_status: string }, 'owner_id' | 'path' | 'content_type' | 'bytes'>
  community_comments: Table<Id & Created & { post_id: string; author_id: string; parent_id: string | null; body: string; moderation_status: string }, 'post_id' | 'author_id' | 'body'>
  community_reactions: Table<{ post_id: string; user_id: string; kind: string }, 'post_id' | 'user_id' | 'kind'>
  community_taggings: Table<{ post_id: string; tag_id: string }, 'post_id' | 'tag_id'>
  community_mentions: Table<{ post_id: string; user_id: string }, 'post_id' | 'user_id'>
  community_feed_items: Table<Created & { user_id: string; post_id: string; reason: string }, 'user_id' | 'post_id'>
  community_notification_preferences: Table<{ user_id: string; category: string; frequency: string }, 'user_id' | 'category'>
  community_notification_events: Table<Id & Created & { recipient_id: string; actor_id: string | null; category: string; subject_id: string; notification_id: string | null; digest_at: string | null; digested_at: string | null }, 'recipient_id' | 'category' | 'subject_id'>
  community_reports: Table<Id & Created & { reporter_id: string; subject_type: string; subject_id: string; reason: string; status: string }, 'reporter_id' | 'subject_type' | 'subject_id' | 'reason'>
  community_moderation_actions: Table<Id & Created & { moderator_id: string | null; report_id: string | null; action: string; reason: string }, 'action' | 'reason'>
  community_rate_limits: Table<{ user_id: string; action: string; window_at: string; hits: number }, 'user_id' | 'action' | 'window_at' | 'hits'>
}
