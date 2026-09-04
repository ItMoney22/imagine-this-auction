# Imagine This Auction — Community & Social Network Build Brief

**Date:** 2026-09-04 · **Owner:** David · **Builder:** a separate agent/session (NOT the launch-build session)
**Status:** approved direction. David: "make sure we emphasize our social network… I want it packed with features."

## Why this exists

Auction platforms (HiBid, Proxibid, LiveAuctioneers) are catalogs with a bid button. Nobody in that tier
has a community. Whatnot proved that follow + live + chat turns buyers into regulars, but it is a
consumer app with 8% seller fees and no room for real auction houses. Imagine This Auction's wedge is:
**a real auction marketplace (1.2% to auctioneers, card-on-file bidding, vetted local delivery) with a
social network on top, so auctioneers get followers and inventory leads, and bidders get a place to
hang out between sales.** This is the "why would an auctioneer choose us" answer, alongside AI Quick
Listing and local delivery.

## Non-negotiable context (read before writing any code)

- Repo: `D:\Projects for MetaSphere\Imagine This Auction`, Next.js 16 App Router + React 19 + Tailwind
  + Supabase (Postgres, RLS, Realtime, Storage) in `apps/web`. Canonical migrations:
  `apps/web/supabase/migrations`. Repo-root `supabase/` is stale, ignore it.
- **A launch build is in progress on `main`** (`docs/plans/2026-09-04-launch-build-plan.md`): payments
  (NMI card-on-file, no wallet), legal pages, monthly statements, merchant applications, delivery
  marketplace. It uses migrations **019–026**. **Do not touch** anything under `lib/payments`,
  `lib/billing`, `lib/delivery`, `lib/merchant`, `app/api/payments`, `app/api/webhooks`,
  `app/api/invoices`, `app/org/payments`, `app/org/billing`, `app/driver`, `app/admin/deliveries`,
  legal pages, or `bidding-panel.tsx`.
- **Work on a branch in a git worktree** (`feature/community`, e.g. `git worktree add
  ../ita-community feature/community`). Number your migrations **030+**. Rebase onto `main` before
  merging; the launch build lands first.
- **No ITC, no wallet, no escrow language anywhere.** Money words that are allowed: hammer price,
  buyer's premium, card on file, monthly statement.
- Roles: `users.role` ∈ `bidder | auctioneer | admin | driver`; `auctioneers` is a 1:1 row per
  auctioneer user (company_name, logo_url, is_approved). No org/membership table exists yet.
- Reuse, don't rebuild: `notifications` table + `deliver-email-batch`/push routes (insert a row, the
  pipeline sends it), Supabase Realtime (`postgres_changes`) as used by delivery screens, AI helpers
  in `lib/ai/*` (`moderation.ts` for text/image checks, `draft.ts` for AI copy via gpt-4o-mini, cost-first),
  storage bucket pattern with signed URLs (`016_ai_quick_listing.sql`, `018_local_delivery_step2_schema.sql`),
  `lib/supabase/admin.ts` (`createAdminClient`, `adminRpc`), existing `components/ui/*` and page shells.
  Watchlists + watchlist alerts already exist (`010_engagement_features.sql`, `012_watchlist_alerts_and_storage.sql`);
  the "Whales" leaderboard already exists (`/leaderboard`).
- DDL cannot be run by agents: every migration also goes to `E:/memory/watchtower/pending-sql/` with a
  README line + inbox note for David (see the launch plan's convention).
- Tests: Playwright unit runner `npm run test:unit` (`apps/web/tests/unit/*.spec.ts`), e2e `npm run test:e2e`.
  TDD per task. Commit often, never push without David.
- Design: follow the existing Tailwind system; mobile-first (auctioneers and bidders are on phones);
  no spinners — the project uses themed progress bars for anything that waits.

## Personas

- **Collector / bidder** — wants to find houses that sell what they collect, get pinged when those
  houses list or go live, show off wins, ask questions before bidding, coordinate pickup.
- **Auctioneer / house** — wants followers (free marketing), inventory (consignments), pre-sale buzz,
  fewer no-pay bidders, and a feed they can post to from a phone in 30 seconds.
- **Consignor / seller** — has an estate, a collection, a barn; wants a local house to take it.
- **Admin** — moderation queue, trust & safety, growth metrics.

## Feature set (packed — build in the phase order below, but design the schema for all of it)

### A. Identity & profiles
1. Public bidder profile at `/u/[handle]`: handle, avatar, banner, bio, location (city only),
   collecting interests (tags), badges, reputation tier, follower/following counts, public wins
   showcase (opt-in per lot), activity tab, "member since".
2. Auction house profile at `/h/[slug]`: banner, logo, about, location + service radius, categories,
   license badge ("Reviewed and licensed"), upcoming auctions rail, live-now banner, past results
   (sell-through, top lots, opt-in), reviews & rating, follower count, Follow / Message / Consign buttons,
   staff members (design the membership table now: `house_members` user↔house with role owner/staff).
3. Handles: unique, reserved words list, change limit; `users.handle`, `auctioneers.slug`.
4. Verified badges: licensed auctioneer (from `is_approved`), verified buyer (has card on file + ≥1 paid
   invoice), driver (internal only, never public).

### B. Follow graph & notifications
5. Follow auctioneers, follow collectors, follow categories/tags, follow a single auction ("remind me").
6. Notification triggers (insert `notifications` rows): followed house posted / listed a new auction /
   goes live in 15 min / went live / auction closing in 1 h; someone followed you; someone replied,
   mentioned (@handle), reacted; your question was answered; consignment claimed; new review.
7. Notification center page + digest email preference (instant / daily / weekly) per category.

### C. Feed & posts
8. Home feed `/feed` (ranked, not purely chronological): posts from followed houses, new lots in followed
   categories, live-now cards, sale recaps, followed collectors' public wins, suggested houses near me.
   Ranking = recency × affinity (follows, past bids in category, distance) with a "Latest" toggle.
   Implement ranking as a pure function with unit tests; materialize `feed_items` (fan-out on write for
   followers ≤ 5k, fan-in on read above that).
9. Post composer for houses (and collectors): text, up to 10 photos, one video (≤ 90 s, uploaded to
   storage, transcoded later — store as-is in v1), **lot embed** (live price + bid CTA rendered in-feed),
   **auction embed** (countdown + register), poll ("which should we list first?"), scheduled publish time.
10. Auto-posts (house opt-in): "Catalog is live", "Going live in 15 min", "Sale recap: 214 lots sold,
    top lot $4,200" (generated from invoices/lots), "New consignment intake day".
11. AI assist in the composer: draft a post from a lot (reuse `lib/ai/draft.ts`), suggest hashtags,
    rewrite shorter. Cost-first models only.
12. Reactions (like + 5 emoji), comments with one level of replies, @mentions, link previews, report.
13. Hashtags/tags: `#coins`, `#estate-sale`, `#rhode-island`; tag pages with follow.
14. Share: OG image per lot/auction/post (generate with `@vercel/og` or similar), copy link, share to
    X/Facebook/WhatsApp/SMS intents.

### D. Ask the auctioneer & lot Q&A
15. Public Q&A thread on every lot: bidders ask, house answers, "Answered" badge, house can pin; unanswered
    questions surface in the house dashboard; question count on the lot card.
16. Condition photo request: bidder requests a specific photo; house uploads; everyone sees it.

### E. Messaging
17. Direct messages bidder ↔ house (pre-sale, pickup coordination), house ↔ consignor, collector ↔ collector
    (only if both follow each other or one opts into open DMs). Realtime via Supabase channels, read receipts,
    image attachments, block/report, admin can view on report.
18. Auction chat room: one room per auction while live and for 24 h after; slow mode; house/staff badges;
    moderator tools; link to Go Live video room (the video stack is a separate research row, design the room so
    the video player drops into it).

### F. Live ("Go Live")
19. "Live now" rail on home, feed, house profile. Live room = video (from the separate video row) + auction
    chat + current lot card + tap-to-bid (calls the existing bid API) + viewer count + reactions stream.
20. Replays: after the sale, the recording (when available) is attached to the auction page and post.

### G. Groups & local
21. Groups by category (Coins, Firearms, Vehicles, Estate, Vintage, Equipment…) and by metro ("Providence
    collectors"). Join, post, pinned rules, house-sponsored groups, member count, moderators.
22. Near me: houses and pickup/preview events within N miles (use `auctioneers` address geocode; the delivery
    build adds pickup lat/lng — read it if present, otherwise geocode once and cache).
23. Events calendar: auction dates, preview days, pickup days, live streams; RSVP/remind me; ICS export.

### H. Consignment marketplace (biggest differentiator)
24. "Sell with a local auctioneer": consignor posts an item or an estate (photos, description, location,
    quantity, timeframe, optional AI identification via the Quick List identify endpoint). Visibility: local
    houses within radius, or all houses.
25. Houses see a consignment inbox, can **claim** (first-come with consignor acceptance) or **quote** (commission
    %, pickup offer, expected sale date). Consignor picks. Converts into an intake record the house can turn into
    lots with Quick List. Both sides rate afterward.
26. House dashboard widget: "12 new consignment requests within 25 miles this week."

### I. Reputation, reviews, trust
27. Bidder reputation (private inputs, public tier): paid invoices on time, no failed charges, no disputes,
    account age, verified card. Tiers: New → Trusted → Established → Whale. Houses can require a minimum
    tier for high-value auctions (setting on the auction).
28. House reviews: only from bidders with a paid invoice at that house; 1–5 stars + text; house can reply
    once; report abusive reviews; aggregate rating on profile and lot cards.
29. Driver reviews stay inside the delivery system (not public).

### J. Gamification & growth
30. Badges/achievements: first win, 10 wins, verified buyer, fast payer, top bidder of the auction (shout-out
    post), streaks (bid in 4 auctions in a row), founding member. Badge showcase on profile.
31. Leaderboards: extend the existing Whales board with weekly/monthly, by category, by house ("top
    collectors at Smith Auctions"), opt-out for privacy.
32. Referrals: invite a friend (both get a badge + early access to a live room), invite an auctioneer (referrer
    gets recognition; David decides any fee credit later — do not implement money).
33. Seasonal challenges (admin-created): "Estate September", collect 5 wins in a category.

### K. Discovery
34. Explore page: trending lots (bid velocity), rising houses, tags, new consignments, live now, near me.
35. People/house search with filters (category, distance, rating, live soon).
36. "I'm looking for" wishlists: collectors post wants; houses browse demand by category/region.

### L. Moderation, safety, admin
37. Report/block/mute on every object; admin moderation queue with actions (hide, warn, suspend, ban),
    audit trail; automated pre-checks with `lib/ai/moderation.ts` (text + images); profanity/spam filters;
    rate limits on posts/comments/DMs; age-gate + category rules for firearms groups and lots.
38. Admin analytics: DAU/WAU, follows, posts, feed CTR to bids, consignment conversions, top houses by
    followers, moderation stats.
39. Privacy: profile visibility settings, hide wins, hide location, download my data, delete account
    (cascade rules), blocked-user invisibility everywhere.

## Data model (sketch — finalize in the first migration, 030)

`profiles` (extends users: handle, bio, avatar_path, banner_path, city, region, interests text[],
visibility jsonb, dm_policy, reputation_tier, reputation_score, badges cache) · `house_members`
(auctioneer_id, user_id, role) · `follows` (follower_id, target_type user|house|tag|auction, target_id) ·
`posts` (author_type user|house, author_id, body, kind text|photo|video|poll|auto, scheduled_at,
published_at, visibility, group_id NULL, auction_id NULL, lot_id NULL, moderation_status) ·
`post_media` · `post_polls`/`poll_votes` · `comments` (post_id | lot_id | consignment_id, parent_id) ·
`reactions` (subject_type, subject_id, user_id, kind) · `mentions` · `tags` / `taggings` ·
`feed_items` (user_id, post_id | lot_id | auction_id, score, reason, created_at) ·
`lot_questions` (lot_id, asker_id, body, answer, answered_by, answered_at, pinned) ·
`conversations` / `conversation_members` / `messages` (with attachments) ·
`auction_rooms` / `room_messages` (slow mode, badges) · `groups` / `group_members` / `group_posts` (or
`posts.group_id`) · `events` / `event_rsvps` · `consignment_requests` / `consignment_offers` /
`consignment_intakes` · `reviews` (house) · `reputation_events` (private inputs) · `badges` /
`user_badges` · `challenges` / `challenge_progress` · `referrals` · `reports` / `moderation_actions` ·
`blocks` / `mutes` · `notification_preferences`. RLS on every table; writes through service-role API
routes where money-adjacent or moderation-sensitive; Realtime publication for `messages`,
`room_messages`, `reactions`, `feed_items`.

Storage: `community-media` (public read for published post media, signed for DMs), `avatars`.

## APIs & surfaces (App Router)

Pages: `/feed`, `/explore`, `/u/[handle]`, `/h/[slug]`, `/groups`, `/groups/[slug]`, `/events`,
`/messages`, `/messages/[id]`, `/consign`, `/consign/[id]`, `/org/community` (house tools: composer,
scheduled posts, Q&A inbox, consignment inbox, reviews, followers, auto-post settings),
`/admin/community` (moderation queue, analytics), `/live/[auctionId]` (room shell).
Routes under `/api/community/*` grouped by object (`posts`, `comments`, `reactions`, `follows`,
`feed`, `questions`, `messages`, `rooms`, `groups`, `events`, `consignments`, `reviews`, `badges`,
`reports`), all zod-validated, rate-limited, moderation-checked.

Nav: add "Community" (feed) and "Messages" to the navbar with unread badge; house sidebar gets
"Community" and "Consignments".

## Phases (each phase ships behind a feature flag `community_v1`)

1. **Profiles + follow + notifications + house feed** (A, B, C8–C12 minus video/polls) — the loop that makes
   auctioneers want followers.
2. **Ask the auctioneer + auction chat room** (D, E18) — pre-sale engagement, plugs into Go Live later.
3. **Consignment marketplace** (H) — inventory lead-gen; the auctioneer retention hook.
4. **DMs + reviews + reputation tiers** (E17, I).
5. **Groups, events, near me, explore, tags, OG sharing** (G, K, C13–C14).
6. **Gamification, referrals, challenges, analytics** (J, L38).
7. **Live room integration** when the video stack lands (F).

Moderation (L37, L39) ships with phase 1 and grows with each phase.

## Acceptance (per phase)

- Unit tests for every pure function (feed ranking, reputation scoring, eligibility, rate limits).
- E2E: create post → follower sees it in feed and gets a notification row; ask question → house answers →
  badge; consignor posts → house claims → intake created.
- RLS verified with a read-only DB check (see `E:/memory/watchtower` notes: node + `pg` against the pooler).
- No ITC/wallet/escrow strings introduced (`grep -rn "ITC\|wallet\|escrow" apps/web` should not grow).
- Mobile screenshots of feed, house profile, composer, consign flow attached to the PR/handoff.

## Handoff back

When a phase is done: commit on `feature/community`, write a handoff note in
`E:/memory/watchtower/handoffs/` + `inbox/zero-earth/`, post results on the Watchtower board row
"Differentiation design: Go Live phone streaming auctions + community layer" (project imagine-this-auction),
and list the pending-SQL files David must run, in order.
