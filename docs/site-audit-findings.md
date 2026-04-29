# ImagineThisAuction — Site Audit Findings

Ongoing audit of every feature and flow on the platform.
Legend: Red-circle Broken | Yellow-circle Confusing/UX | Green-circle Works well | Zap Speed issue

## Audit Checklist

- [x] 1. Homepage & Marketing (page.tsx, how-it-works) — 2026-03-11
- [x] 2. Auth (login, signup, auth-form) — 2026-03-11
- [x] 3. Marketplace - Auctions (auctions list, auction detail, filters, cards) — 2026-03-11
- [x] 4. Marketplace - Lots (lots list, lot detail, bidding-panel, bid-history) — 2026-03-11
- [x] 5. Org/Auctioneer Dashboard (org pages, auction-form, lot-form, csv-upload) — 2026-03-12
- [x] 6. Bidder Dashboard (dashboard, invoices) — 2026-03-12
- [x] 7. Wallet & Payments (wallet, credit-packs, transaction-history, payment APIs) — 2026-03-12
- [x] 8. Admin Panel (admin dashboard, user/auctioneer/compliance/payout management) — 2026-03-12
- [x] 9. Notifications & Settings (notification preferences, push settings, interest tags) — 2026-03-12
- [x] 10. API Layer (health, webhooks, demo endpoints, AI routes) — 2026-03-12

---

## 1. Homepage & Marketing (2026-03-11)

**What was checked:** app/page.tsx, app/how-it-works/page.tsx, app/layout.tsx, globals.css

### Correctness
- Red-circle **Dead imports in how-it-works** — `CreditCard` and `Shield` imported but never used
  - **Fix applied:** Removed both dead imports
  - File: `app/how-it-works/page.tsx:6,9`
- Red-circle **Undefined animation class** — `animate-fade-in` used in hero but never defined in CSS
  - **Fix applied:** Added `@keyframes fade-in` and `.animate-fade-in` to globals.css
  - File: `app/page.tsx:210,247` / `app/globals.css`
- Yellow-circle **No error handling on Supabase queries** — layout.tsx and page.tsx have no try/catch around database calls
  - File: `app/layout.tsx:28-41`, `app/page.tsx:138-156`
- Green-circle **All routes, images, and component references are valid**

### Duplicate UX
- Green-circle **Multiple CTAs to /signup** — intentional marketing pattern, no conflicts

### User Clarity
- Yellow-circle **Placeholder lots not labeled** — when no live auctions exist, hardcoded demo data shows without any "Sample" indicator
  - File: `app/page.tsx:181`

### Site Speed
- Zap **Missing `sizes` on 4 images in how-it-works** — prevents responsive image optimization
  - **Fix applied:** Added `sizes="(max-width: 1024px) 100vw, 50vw"` to all 4 images
  - File: `app/how-it-works/page.tsx:70,160,210,235`
- Zap **No loading.tsx for root route** — blank page while Supabase queries run
  - **Fix applied:** Created `app/loading.tsx` with spinner skeleton
- Green-circle **Both pages are Server Components** — no unnecessary 'use client'
- Green-circle **Hero image has `priority` set correctly**
- Green-circle **All data fetched server-side**
- Yellow-circle **Sequential Supabase queries** — auctions then lots could potentially be parallelized
  - File: `app/page.tsx:138-155`

### Verdict: 4 issues auto-fixed (dead imports, missing animation, missing image sizes, missing loading.tsx). 3 items documented for later (error handling, placeholder labeling, query parallelization).

---

## 2. Auth (2026-03-11)

**What was checked:** app/login/page.tsx, app/signup/page.tsx, components/auth/auth-form.tsx, middleware.ts, lib/supabase/server.ts, lib/supabase/middleware.ts, lib/api/admin-auth.ts, app/auth/callback/route.ts

### Correctness
- Red-circle **Auth middleware completely disabled** — `middleware.ts:25-26` returns `NextResponse.next()` unconditionally, all route protection bypassed. Intentional for dev but MUST be re-enabled before production.
  - File: `middleware.ts:22-26`
- Red-circle **Admin auth bypass in dev mode** — `lib/api/admin-auth.ts:6-20` returns a mock admin user when `NODE_ENV !== 'production'`, granting full admin access
  - File: `lib/api/admin-auth.ts:6-20`
- Red-circle **Dead middleware file** — `lib/supabase/middleware.ts` has `updateSession()` function that is never imported or called anywhere
  - File: `lib/supabase/middleware.ts`
- Yellow-circle **No error handling in auth callback** — profile creation failure only logged to console, user left in inconsistent state
  - File: `app/auth/callback/route.ts:33-36`
- Yellow-circle **Session refresh relies on disabled middleware** — `lib/supabase/server.ts:20-25` `setAll()` silently ignores cookie failures, expecting middleware to handle refresh
- Green-circle **All imports used in auth-form.tsx** — no dead imports
- Green-circle **Login/signup pages are Server Components** that correctly redirect authenticated users

### Duplicate UX
- Green-circle **Single AuthForm component** reused for both login and signup via `mode` prop — no duplication

### User Clarity
- Yellow-circle **Magic link vs password mode unclear** — both options shown with no explanation of differences or recommendation
  - File: `components/auth/auth-form.tsx:30,117-139`
- Yellow-circle **No password reset flow** — no `/forgot-password` route exists; users who forget passwords have no recovery path
- Yellow-circle **Weak password requirements** — only 6 character minimum, no complexity rules shown to user
  - File: `components/auth/auth-form.tsx:15`
- Green-circle **Error messages are helpful** — email validation, password length shown clearly

### Site Speed
- Zap **No loading.tsx for login/signup routes** — blank page while server checks auth
  - **Fix applied:** Created `app/login/loading.tsx` and `app/signup/loading.tsx` with skeleton forms
- Green-circle **Auth pages are Server Components** with minimal client-side (only AuthForm)
- Yellow-circle **Two form instances always initialized** — both magic link and password forms loaded in memory even though only one shown
  - File: `components/auth/auth-form.tsx:34-40`

### Verdict: 1 speed fix applied (loading skeletons for login/signup). 3 critical security items documented for pre-production (middleware disabled, admin bypass, dead middleware file). 4 UX items documented (password reset, password strength, magic link clarity, dual form loading).

---

## 3. Marketplace - Auctions (2026-03-11)

**What was checked:** app/auctions/page.tsx, app/auctions/[id]/page.tsx, components/marketplace/auction-card.tsx, auction-header.tsx, auction-info.tsx, auction-filters.tsx, search-bar.tsx, lot-grid.tsx, lot-card.tsx, api/auctions/[id]/close/route.ts

### Correctness
- Red-circle **Wrong column name `amount_itc`** — bids query references non-existent column; actual column is `amount`
  - **Fix applied:** Changed `amount_itc` to `amount`
  - File: `app/auctions/[id]/page.tsx:83`
- Red-circle **Wrong column name `start_price_itc`** — sort queries reference non-existent column; actual column is `starting_bid`
  - **Fix applied:** Changed `start_price_itc` to `starting_bid` (2 occurrences)
  - File: `app/auctions/[id]/page.tsx:111,114`
- Red-circle **Wrong field name `approved`** — should be `is_approved` per schema
  - **Fix applied:** Changed to `is_approved` (3 occurrences)
  - File: `components/marketplace/auction-info.tsx:182-185`
- Red-circle **Non-existent `reserve_allowed` field** — displayed in auction info but column doesn't exist in auctions table
  - **Fix applied:** Removed the reserve_allowed display block
  - File: `components/marketplace/auction-info.tsx:66-71`
- Yellow-circle **Missing `slug` field on auctioneers** — auctioneer profile links use `slug` field that doesn't exist in schema; degrades gracefully (links just don't render)
  - File: `auction-card.tsx:114-119`, `auction-header.tsx:94-100`, `auction-info.tsx:189-198`
- Yellow-circle **Auth checks disabled** — `canView` hardcoded to `true`, all auctions visible including drafts
  - File: `app/auctions/[id]/page.tsx:39-75`
- Green-circle **All imports used** — no dead imports found

### Duplicate UX
- Green-circle **Single auction list → detail flow** — no conflicting navigation or duplicate views

### User Clarity
- Green-circle **Empty states present** — both auction list and lot grid show helpful messages when no data
- Yellow-circle **Inconsistent empty state copy** — auction list says "Check back soon" vs lot grid says "Try adjusting filters"

### Site Speed
- Zap **No loading.tsx for auction routes** — blank page during server-side data fetches
  - **Fix applied:** Created `app/auctions/loading.tsx` and `app/auctions/[id]/loading.tsx` with skeleton UIs
- Yellow-circle **Sequential DB queries** — auction detail page runs 3 sequential queries (auction → lots → categories) that could use `Promise.all()`
  - File: `app/auctions/[id]/page.tsx:24-134`
- Yellow-circle **Raw `<img>` in lot-card** — uses `<img>` instead of `next/Image` for lot images, missing lazy loading and optimization
  - File: `components/marketplace/lot-card.tsx:82-88`
- Yellow-circle **Excessive `any` types** — all marketplace components use `any` for auction/lot props, losing type safety
- Green-circle **Server Components used correctly** — pages are server components, only interactive parts are client

### Verdict: 4 critical schema mismatches fixed (amount_itc, start_price_itc, approved, reserve_allowed). 2 loading skeletons added. 4 items documented for later (slug field, sequential queries, image optimization, type safety).

---

## 4. Marketplace - Lots (2026-03-11)

**What was checked:** app/lots/page.tsx, app/lots/[id]/page.tsx, components/marketplace/lot-card.tsx, lot-detail.tsx, lot-filters.tsx, bidding-panel.tsx, bid-history.tsx, lot-grid.tsx, search-bar.tsx

### Correctness
- Red-circle **RPC parameter names wrong** — `place_bid` called with `p_lot_id`, `p_user_id`, `p_amount` but schema expects `lot_uuid`, `bidder_uuid`, `bid_amount`. All bids would fail.
  - **Fix applied:** Changed to correct parameter names
  - File: `components/marketplace/bidding-panel.tsx:185-189`
- Red-circle **SearchBar routes to wrong page** — search from lots page navigated to `/auctions` instead of `/lots`
  - **Fix applied:** Changed both `router.push` calls to `/lots?...`
  - File: `components/marketplace/search-bar.tsx:24,31`
- Red-circle **Non-existent `slug` column in query** — lots page query selects `slug` from auctioneers which doesn't exist
  - **Fix applied:** Changed to select `id` instead
  - File: `app/lots/page.tsx:33`
- Red-circle **LotCard prop mismatch** — browse lots page passes only `lot` but LotCard required `auction`, `onImageError`, `hasImageError`
  - **Fix applied:** Made extra props optional with defaults; LotCard now falls back to `lot.auctions` for auction data and uses `lot.current_high_bid`/`lot.bid_count` from DB
  - File: `components/marketplace/lot-card.tsx:10-28`
- Red-circle **Image counter positioning bug** — absolute-positioned badge outside relative container
  - **Fix applied:** Added `relative` class to image container div
  - File: `components/marketplace/lot-card.tsx:81`
- Yellow-circle **Duplicate real-time bid subscriptions** — bidding-panel and bid-history both subscribe to same bids channel independently
  - File: `bidding-panel.tsx:84-150`, `bid-history.tsx:24-58`
- Yellow-circle **Manual wallet balance calculation** — lot detail page loops through ledger instead of using `get_wallet_balance()` DB function
  - File: `app/lots/[id]/page.tsx:72-93`

### Duplicate UX
- Green-circle **Single bid flow** — one bidding panel per lot detail page, no conflicting bid UIs

### User Clarity
- Green-circle **Empty states present** — lots browse page shows message when no lots found
- Yellow-circle **Search placeholder says "Search auctions..."** — should say "Search lots..." on the lots page
  - File: `components/marketplace/search-bar.tsx:40`

### Site Speed
- Zap **No loading.tsx for lots route**
  - **Fix applied:** Created `app/lots/loading.tsx` with skeleton grid
- Yellow-circle **Sequential queries on lots browse page** — 3 queries (lots, categories, auctions) run sequentially, could use `Promise.all()`
  - File: `app/lots/page.tsx:74-92`
- Yellow-circle **Raw `<img>` instead of next/Image** — lot-card and lot-detail use `<img>` tags
  - File: `lot-card.tsx:83`, `lot-detail.tsx:111`
- Green-circle **Pages are Server Components** — correct architecture

### Verdict: 5 critical bugs fixed (RPC params, search routing, slug column, LotCard props, image positioning). 1 loading skeleton added. 4 items documented for later (duplicate subscriptions, wallet calc, sequential queries, image optimization).

---

## 5. Org/Auctioneer Dashboard (2026-03-12)

**What was checked:** app/org/page.tsx, app/org/auctions/page.tsx, app/org/auctions/new/page.tsx, app/org/auctions/[id]/page.tsx, app/org/auctions/[id]/lots/page.tsx, app/org/invoices/page.tsx, app/org/settings/page.tsx, components/org/auction-form.tsx, lot-form.tsx, csv-upload.tsx, org-sidebar.tsx, auctioneer-invoice-manager.tsx, ai-assistant-settings.tsx

### Correctness
- Red-circle **CSV upload uses wrong column names** — `start_price_itc`, `bid_increment_itc`, `reserve_price_itc` don't exist; schema uses `starting_bid`, `increment`, `reserve_price`. All CSV imports would fail.
  - **Fix applied:** Renamed all field references, updated sample CSV template and documentation
  - File: `components/org/csv-upload.tsx` (throughout)
- Red-circle **Auction form uses non-existent `reserve_allowed` field** — field doesn't exist in auctions table, save would fail
  - **Fix applied:** Removed `reserve_allowed` toggle, form data init, and dead `Switch` import
  - File: `components/org/auction-form.tsx:33,219-232`
- Red-circle **CSV validation referenced `auction.reserve_allowed`** — removed along with the non-existent field
  - **Fix applied:** Removed the validation check
  - File: `components/org/csv-upload.tsx:68-70`
- Yellow-circle **Auth disabled on auctions pages** — `org/auctions/page.tsx` and `org/auctions/[id]/page.tsx` have auth checks commented out with hardcoded dummy data
  - File: `app/org/auctions/page.tsx:12-68`, `app/org/auctions/[id]/page.tsx:14-49`
- Yellow-circle **Missing pages linked from sidebar** — `/org/lots` and `/org/payouts` referenced in sidebar but no pages exist (404)
  - File: `components/org/org-sidebar.tsx:39,44`
- Green-circle **lot-form.tsx uses correct field names** — `starting_bid`, `increment`, `reserve_price` all correct
- Green-circle **Proper auth on main org dashboard, lots management, settings pages**

### Duplicate UX
- Green-circle **Single AuctionForm and LotForm** — no duplicate or conflicting CRUD UIs
- Green-circle **Multiple navigation paths to create auction** — standard pattern, not a conflict

### User Clarity
- Green-circle **Good empty states** — all list pages show helpful messages when empty
- Green-circle **Loading states present** — upload progress, AI spinner, submit button disables
- Green-circle **Success/error feedback** — toast messages and alerts after CRUD operations
- Green-circle **Clear sidebar navigation** with active state highlighting

### Site Speed
- Green-circle **Correct 'use client' usage** — pages are Server Components, only interactive forms are client
- Yellow-circle **Sequential dashboard queries** — payouts and fulfillment queries run sequentially, could use `Promise.all()`
  - File: `app/org/page.tsx:174-230`
- Green-circle **Form validation is comprehensive** — required fields, numeric checks, range validation

### Verdict: 3 critical bugs fixed (CSV column names, reserve_allowed field, dead Switch import). 2 items documented as pre-production blockers (auth disabled on auctions pages). 2 items documented for later (missing sidebar pages, sequential queries).

---

## 6. Bidder Dashboard (2026-03-12)

**What was checked:** app/dashboard/page.tsx, app/invoices/page.tsx, components/bidder/invoices-dashboard.tsx

### Correctness
- Red-circle **Dead `redirect` import in dashboard** — `redirect` imported from `next/navigation` but never used (auth code commented out)
  - **Fix applied:** Removed unused `redirect` import
  - File: `app/dashboard/page.tsx:2`
- Red-circle **Dead `redirect` import in invoices** — same issue
  - **Fix applied:** Removed unused `redirect` import
  - File: `app/invoices/page.tsx:1`
- Yellow-circle **Auth completely disabled** — dashboard uses hardcoded dummy user profile; no real auth check. Must be re-enabled before production.
  - File: `app/dashboard/page.tsx:7-42`
- Yellow-circle **No real data fetching** — wallet balance, active bids, won items all hardcoded to 0; no Supabase queries
  - File: `app/dashboard/page.tsx:59-85`
- Yellow-circle **Non-functional buttons** — "Add Credits", "View All Bids", "View Won Items" are plain `<button>` elements with no onClick handlers or Link wrappers
  - File: `app/dashboard/page.tsx:62-63,72-73,82-83`
- Green-circle **Invoices component schema is correct** — column names match database schema, currency formatting correct (cents→dollars)
- Green-circle **All imports used in invoices-dashboard.tsx**

### Duplicate UX
- Green-circle **Single dashboard view per role** — no conflicting dashboards

### User Clarity
- Green-circle **Empty state for recent activity** — shows helpful message with guidance to start bidding
- Yellow-circle **Dashboard shows dummy data without indication** — user sees "0 ITC", "0 Active Bids" etc. with no label that these are placeholder values

### Site Speed
- Zap **No loading.tsx for dashboard route**
  - **Fix applied:** Created `app/dashboard/loading.tsx` with skeleton cards
- Zap **No loading.tsx for invoices route**
  - **Fix applied:** Created `app/invoices/loading.tsx` with skeleton table
- Green-circle **Dashboard page is a Server Component** — correct architecture
- Green-circle **InvoicesDashboard correctly uses 'use client'** — needs client-side interactivity for filtering/sorting

### Verdict: 2 dead imports fixed, 2 loading skeletons added. 3 items documented as pre-production blockers (auth disabled, no real data fetching, non-functional buttons). 1 UX item documented (dummy data not labeled).

---

## 7. Wallet & Payments (2026-03-12)

**What was checked:** app/wallet/page.tsx, components/wallet/wallet-dashboard.tsx, wallet-balance.tsx, credit-packs.tsx, transaction-history.tsx, lib/payments/config.ts, lib/payments/types.ts, app/api/wallet/balance/route.ts, app/api/payments/card/create/route.ts, app/api/payments/reconcile/daily/route.ts, app/api/webhooks/paymentcloud/route.ts, app/api/invoices/route.ts, app/api/invoices/[id]/ship/route.ts

### Correctness
- Red-circle **`providerLabel` defined outside component function** — variable declared on line 174 after the closing brace of `WalletDashboard`, but referenced inside the component on line 47. Would crash at runtime.
  - **Fix applied:** Moved `const providerLabel = PROVIDER_LABEL[PAYMENT_PROVIDER]` inside the component function
  - File: `components/wallet/wallet-dashboard.tsx:174`
- Red-circle **React imported after usage** — `React.createElement()` used on line 46 but `import React` was on line 176 (after the component). Module-level hoisting may mask this in bundlers but it's incorrect.
  - **Fix applied:** Moved `import React from 'react'` to top of file, removed trailing import
  - File: `components/wallet/transaction-history.tsx:46,176`
- Red-circle **Missing `payout` in WalletTransaction type** — database schema supports `payout` transaction type but TypeScript interface omits it, causing type errors on payout records
  - **Fix applied:** Added `'payout'` to the union type
  - File: `lib/payments/types.ts:30`
- Yellow-circle **Webhook signature validation skipped when secret is unset** — `if (WEBHOOK_SECRET && signature !== WEBHOOK_SECRET)` means no validation when `WEBHOOK_SECRET` is undefined. Should be `if (!WEBHOOK_SECRET || signature !== WEBHOOK_SECRET)`.
  - File: `app/api/webhooks/paymentcloud/route.ts:15-18`
- Yellow-circle **PaymentCloud API not implemented** — payment create route records the event but doesn't call PaymentCloud's API. Comment says "TODO: Once PaymentCloud credentials are available".
  - File: `app/api/payments/card/create/route.ts:85-91`
- Yellow-circle **Reconcile daily route is a stub** — no actual reconciliation logic
  - File: `app/api/payments/reconcile/daily/route.ts`
- Green-circle **All wallet/invoice API routes have proper auth checks** — user.id filtering present
- Green-circle **Invoice ship route has role-based permission check** — admin or auctioneer only
- Green-circle **Wallet balance API calculates correctly** — sums credits (purchase, bid_refund, escrow_release) and subtracts debits (bid_hold, escrow_hold)

### Duplicate UX
- Green-circle **Single credit purchase flow** — CreditPacks component is the only purchase UI, BiddingPanel links to /wallet when low balance (intentional)
- Green-circle **No conflicting payment UIs**

### User Clarity
- Green-circle **Good empty state for transactions** — shows helpful message with guidance
- Green-circle **Error state with retry button** — wallet dashboard shows error with "Try Again" action
- Yellow-circle **"(activation pending)" label on credit packs** — shows green checkmark but says pending, confusing
  - File: `components/wallet/credit-packs.tsx:205-220`
- Yellow-circle **InvoicesDashboard silent error handling** — fetch failure only logged to console, no error UI shown to user
  - File: `components/bidder/invoices-dashboard.tsx:41-59`
- Yellow-circle **Inconsistent currency formatting** — wallet uses `formatCurrency()` showing "$X.XX (Y ITC)" while invoices use a local formatter showing only "$X.XX"

### Site Speed
- Zap **No loading.tsx for wallet route**
  - **Fix applied:** Created `app/wallet/loading.tsx` with skeleton layout matching wallet dashboard
- Yellow-circle **Client-side wallet data fetch waterfall** — Server Component parent could fetch data and pass it down instead of client useEffect
  - File: `components/wallet/wallet-dashboard.tsx:54-77`
- Green-circle **All 'use client' directives are necessary** — components need state, effects, and event handlers
- Green-circle **Auth checks run server-side on wallet page** — correct architecture
- Yellow-circle **Wallet balance API recalculates from full ledger** — could use most recent `balance_after` field instead of summing all transactions
  - File: `app/api/wallet/balance/route.ts:36-80`

### Verdict: 3 critical bugs fixed (providerLabel placement, React import order, missing payout type). 1 loading skeleton added. 3 items documented as pre-production blockers (webhook security, PaymentCloud API not implemented, reconciliation stub). 4 items documented for later (currency inconsistency, error handling, client-side waterfall, balance recalculation).

---

## 8. Admin Panel (2026-03-12)

**What was checked:** app/admin/page.tsx, app/admin/demo/page.tsx, components/admin/admin-dashboard.tsx, user-manager.tsx, auctioneer-manager.tsx, compliance-manager.tsx, financial-reports.tsx, notification-manager.tsx, invoice-manager.tsx, payout-manager.tsx, notification-batches.tsx, notification-stats.tsx, lib/api/admin-auth.ts, app/api/admin/users/route.ts, app/api/admin/users/[id]/role/route.ts, app/api/admin/users/[id]/status/route.ts, app/api/admin/auctioneers/route.ts, app/api/admin/auctioneers/[id]/status/route.ts, app/api/admin/compliance/route.ts, app/api/admin/financials/route.ts, app/api/admin/announcements/[id]/route.ts

### Correctness
- Red-circle **`params.id` used instead of destructured `id` variable** — In announcements PUT route (line 96) and DELETE route (line 187), `params.id` is used but `params` is a Promise in Next.js 16. The `id` was already correctly destructured on lines 14 and 123. Would pass `undefined` to the RPC call.
  - **Fix applied:** Changed `params.id` to `id` in both PUT and DELETE handlers
  - File: `app/api/admin/announcements/[id]/route.ts:96,187`
- Yellow-circle **Auth disabled on all admin API routes** — Every API route under `app/api/admin/` has auth checks commented out with `// TEMPORARY: Skip auth for development`. Routes affected: users, users/[id]/role, users/[id]/status, auctioneers, auctioneers/[id]/status, compliance, announcements/[id]
  - Files: All `app/api/admin/*/route.ts` files
- Yellow-circle **Admin auth bypass in dev mode** — `lib/api/admin-auth.ts:8-20` returns mock admin user when `NODE_ENV !== 'production'`
- Yellow-circle **Hardcoded `'dev-admin-id'` in audit logs** — Multiple API routes write fake admin IDs to audit trail instead of actual user context
  - Files: `users/[id]/role/route.ts:68`, `users/[id]/status/route.ts:68`, `auctioneers/[id]/status/route.ts:60`, `announcements/[id]/route.ts:93,184`
- Yellow-circle **Overview tab uses hardcoded placeholder stats** — Shows `'45'` total auctions, `'12'` pending invoices, `'$24,570'` escrow, `'$8,420'` payouts — all fake data with no indicator
  - File: `components/admin/admin-dashboard.tsx:80-105`
- Yellow-circle **Non-functional compliance buttons** — "Approve" and "Reject" buttons for KYC documents have no onClick handlers
  - File: `components/admin/compliance-manager.tsx:485-490`
- Yellow-circle **Non-functional invoice "View Details" button** — onClick has only a console.log in dev, no-op in production
  - File: `components/admin/invoice-manager.tsx:187-195`
- Green-circle **Admin page (app/admin/page.tsx) has proper auth** — Server-side auth check with redirect, NOT disabled
- Green-circle **Demo admin page correctly uses existing schema column names** — DB queries use `amount`, `starting_bid`, etc. (internal interface uses `_itc` suffix names for display only)

### Duplicate UX
- Green-circle **Single tabbed admin dashboard** — all management functions organized in one place with clear tabs
- Yellow-circle **Overview tab shows fake data alongside real data tabs** — could mislead admin into thinking stats are real

### User Clarity
- Green-circle **Good empty states** — user-manager, auctioneer-manager show messages when no data
- Green-circle **Clear tab navigation** — 8 tabs with names and descriptions
- Yellow-circle **No breadcrumbs or back navigation** between admin sections
- Yellow-circle **Disabled buttons lack explanation** — buttons disabled without tooltip or message saying why

### Site Speed
- Zap **No loading.tsx for admin route**
  - **Fix applied:** Created `app/admin/loading.tsx` with skeleton matching admin dashboard layout
- Yellow-circle **All admin components are client-side** — UserManager, AuctioneerManager, ComplianceManager, etc. all fetch data client-side with useEffect. Could be refactored to Server Components with server-side fetching.
- Yellow-circle **N+1 query in auctioneers API** — for each auctioneer, 2 separate DB queries run (auctions count + payouts). Should batch queries.
  - File: `app/api/admin/auctioneers/route.ts:93-122`
- Green-circle **Demo page uses `Promise.all()` for parallel data loading** — correct pattern
- Green-circle **`'use client'` on admin-dashboard.tsx is necessary** — uses useState for tab switching

### Verdict: 1 critical bug fixed (params.id → id in announcements API). 1 loading skeleton added. 7 pre-production blockers documented (auth disabled on all API routes, admin auth bypass, hardcoded admin IDs, fake overview stats, non-functional buttons). 3 items documented for later (N+1 query, client-side components, missing breadcrumbs).

---

## 9. Notifications & Settings (2026-03-12)

**What was checked:** app/settings/notifications/page.tsx, app/org/settings/page.tsx, app/admin/notifications/page.tsx, components/settings/notification-preferences.tsx, push-notification-settings.tsx, interest-tags.tsx, notification-history.tsx, components/admin/notification-controls.tsx, notification-stats.tsx, notification-batches.tsx, notification-manager.tsx, components/org/ai-assistant-settings.tsx, app/api/notifications/push/route.ts, app/api/notifications/deliver-email-batch/route.ts, app/api/ai/copywriter/route.ts, lib/push-notifications.ts, lib/types/database.ts, all migration files

### Correctness
- Red-circle **React imports at bottom of file** — `lib/push-notifications.ts` had `import { useState, useEffect } from 'react'` on line 358-359, AFTER the `usePushNotifications()` hook that uses them (lines 294-356). Would fail to parse.
  - **Fix applied:** Moved import to top of file, removed trailing import
  - File: `lib/push-notifications.ts:358-359`
- Red-circle **5 missing database tables** — Notification system references tables that don't exist in schema and have no migration: `notifications`, `user_interests`, `user_device_tokens`, `notification_batches`, `feature_flags`. All queries to these tables will fail with "relation does not exist".
  - Files: `app/settings/notifications/page.tsx:30,36,43`, `app/api/notifications/push/route.ts:53,67,117`, `app/api/notifications/deliver-email-batch/route.ts:207,377`, `app/api/ai/copywriter/route.ts:213,279`
- Red-circle **Non-existent `notification_prefs` column** — Code reads/writes `users.notification_prefs` but column doesn't exist in users table schema
  - Files: `app/settings/notifications/page.tsx:79`, `components/settings/notification-preferences.tsx:43`
- Red-circle **Non-existent `hype_copy` column on lots** — AI copywriter route writes to `lots.hype_copy` which doesn't exist in schema
  - File: `app/api/ai/copywriter/route.ts:254`
- Red-circle **Non-existent API endpoint** — `components/admin/notification-controls.tsx:22` calls `POST /api/edge-functions/recommend-daily` which doesn't exist
  - File: `components/admin/notification-controls.tsx:22`
- Yellow-circle **No auth on notification API routes** — `app/api/notifications/push/route.ts` POST and `app/api/notifications/deliver-email-batch/route.ts` POST have no authentication checks
- Yellow-circle **Interest tags don't persist** — `components/settings/interest-tags.tsx` only updates local state; changes lost on refresh (target table `user_interests` doesn't exist anyway)
- Green-circle **Settings page uses `Promise.all()`** — parallel DB queries (correct pattern, though queries fail due to missing tables)
- Green-circle **Org settings page has proper auth** — checks auctioneer role with redirect
- Green-circle **Admin notifications page has proper auth** — checks admin role

### Duplicate UX
- Yellow-circle **Notification preferences split across disconnected components** — NotificationPreferences, PushNotificationSettings, InterestTags, and NotificationHistory all on one page but have no shared state or coordination
- Green-circle **Single org settings page** — AI assistant settings centralized in one place

### User Clarity
- Yellow-circle **Push device management is read-only** — title suggests "Manage devices" but component only displays a list with no remove/edit actions
  - File: `components/settings/push-notification-settings.tsx:22-32`
- Yellow-circle **SMS toggle disabled without context** — shows "Coming Soon" but no timeline or explanation
  - File: `components/settings/notification-preferences.tsx:120-136`
- Yellow-circle **Interest tags empty state unhelpful** — shows "No categories available" with no guidance
  - File: `components/settings/interest-tags.tsx:48-50`
- Green-circle **Notification history has clean empty state**

### Site Speed
- Zap **No loading.tsx for settings/notifications route**
  - **Fix applied:** Created `app/settings/notifications/loading.tsx` with skeleton layout
- Yellow-circle **Notification preferences could be Server Component** — receives data as props but marked 'use client' for form submission that could use Server Actions
  - File: `components/settings/notification-preferences.tsx:1`
- Yellow-circle **Unused `usePushNotifications` hook** (~60 lines) — exported from `lib/push-notifications.ts` but never imported anywhere in codebase
  - File: `lib/push-notifications.ts:294-356`
- Green-circle **Settings page fetches data server-side** — correct architecture

### Verdict: 1 import order bug fixed, 1 loading skeleton added. 5 critical schema issues documented (missing 5 tables, missing 2 columns, missing API endpoint) — entire notification subsystem is non-functional until migration is created. 2 auth issues documented. 3 UX items documented.

---

## 10. API Layer (2026-03-12)

**What was checked:** app/api/ai/listing-assistant/route.ts, app/api/demo/summary/route.ts, app/api/demo/control/route.ts, app/api/demo/logs/route.ts, app/api/demo/migrate/route.ts, app/api/demo/debug/route.ts, app/api/auctions/[id]/close/route.ts, app/api/payouts/route.ts, lib/demo/logger.ts, lib/ai/listing-assistant.ts, lib/api/admin-auth.ts, middleware.ts

### Correctness
- Red-circle **Invalid OpenAI model name `gpt-4.1`** — model doesn't exist in OpenAI's API. All AI listing assistant requests would return 400 error.
  - **Fix applied:** Changed to `gpt-4-turbo`
  - File: `app/api/ai/listing-assistant/route.ts:11`
- Red-circle **`lots.status` referenced but doesn't exist** — demo summary endpoint tries to group lots by `status` field, but lots table has no `status` column. Would produce `{ undefined: N }` in response.
  - **Fix applied:** Replaced lots status breakdown with simple `{ total: lots.length }`
  - File: `app/api/demo/summary/route.ts:169-172`
- Red-circle **Demo logger queries 6 non-existent columns** — `collectMetrics()` queries `lots.demo_label`, `lots.status`, `lots.lot_starts_at`, `lots.ended_at`, `users.demo_label`, `users.metadata`, `bids.demo_label`. All queries will fail.
  - File: `lib/demo/logger.ts:310-347`
- Red-circle **Demo control hardcodes Unix paths** — `execAsync` commands use `/root/imagine-this-auction/apps/web` — won't work on any other machine or Windows
  - File: `app/api/demo/control/route.ts:191-200`
- Yellow-circle **Demo routes only check `DEMO.ENABLED` flag** — no `NODE_ENV !== 'production'` guard. If `NEXT_PUBLIC_DEMO_MODE=true` in production, demo control (start/stop/reset) endpoints are publicly accessible.
  - Files: All `app/api/demo/*/route.ts` files
- Yellow-circle **Middleware auth completely disabled** — `middleware.ts:25-26` returns `NextResponse.next()` unconditionally. All route protection bypassed (also noted in Cycle 2).
  - File: `middleware.ts:25-26`
- Yellow-circle **In-memory rate limiting** — AI listing assistant uses `Map<string, number[]>()` for rate limits. Won't persist across server restarts or multiple instances.
  - File: `app/api/ai/listing-assistant/route.ts:14`
- Yellow-circle **Greedy JSON extraction regex** — `extractJson()` uses `[\s\S]*` which captures between first `{` and last `}`, may extract wrong JSON if model returns multiple objects
  - File: `app/api/ai/listing-assistant/route.ts:69-75`
- Yellow-circle **No request size limits on AI route** — no upper bound on image URL array size before passing to OpenAI
  - File: `app/api/ai/listing-assistant/route.ts:131`
- Yellow-circle **Payouts double-payment race condition** — between checking `is_paid=false` and updating, another request could mark it paid
  - File: `app/api/payouts/route.ts:138-150`
- Green-circle **Auction close endpoint has proper auth** — checks user is authenticated
- Green-circle **Demo summary uses `Promise.all()`** — parallel queries, correct pattern
- Green-circle **AI listing assistant validates input with Zod schema**
- Green-circle **Payouts route has role-based access** — filters by user role (bidder, auctioneer, admin)

### Duplicate UX
- Green-circle **No duplicate API routes** — each resource has a single endpoint
- Green-circle **Demo control centralized** — single route handles start/stop/reset

### User Clarity
- Green-circle **API error responses include descriptive messages**
- Yellow-circle **Inconsistent error response format** — some routes return `{ error: string }`, others `{ error: string, details: string }`. No standard schema.

### Site Speed
- Green-circle **All API routes are server-side only** — no 'use client' issues
- Green-circle **Demo summary parallelizes all queries with Promise.all()**
- Yellow-circle **Payouts GET runs sequential queries** — user role query then payouts query, could combine
  - File: `app/api/payouts/route.ts:23-27`

### Verdict: 2 critical bugs fixed (invalid model name, lots.status reference). 2 critical issues documented but too structural to quick-fix (demo logger schema mismatches, hardcoded paths). 5 security items documented (demo route exposure, middleware disabled, in-memory rate limits, race condition, no request size limits). Full audit cycle complete — all 10 areas covered.

---
