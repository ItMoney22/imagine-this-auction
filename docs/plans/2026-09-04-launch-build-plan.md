# Launch Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (this session) or superpowers:executing-plans (parallel session) to implement this plan task-by-task.

**Goal:** Take Imagine This Auction from "no money can move" to a launchable marketplace on the model David locked on 2026-09-04: auctioneer-owned PaymentCloud/NMI merchant accounts, bidder card on file, no ITC, auctioneer keeps the buyer's premium, ITA bills 1.2% monthly, plus the driver delivery marketplace.

**Architecture:** Next.js 16 App Router in `apps/web`, Supabase (Postgres + RLS + storage) with canonical migrations in `apps/web/supabase/migrations` (numbering continues at 019), all money writes through service-role API routes, NMI gateway via Direct Post API + Collect.js hosted fields + Customer Vault, one gateway account with a `processor_id` per auctioneer. Stripe Connect Express only for driver payouts. Resend for email, existing notifications pipeline for push/email, Twilio for driver SMS.

**Tech Stack:** TypeScript, React 19, Tailwind, zod, Playwright unit runner (`npm run test:unit`, config `apps/web/playwright.unit.config.ts`), Playwright e2e (`npm run test:e2e`), NMI Direct Post API (`https://secure.nmi.com/api/transact.php`) with the public sandbox security key `6457Thfj624V5r7WUwc5v6a68Zsd6YEm` until live keys land Monday 2026-09-07.

**Source documents:** `docs/audits/2026-09-04-launch-economics-audit.md` (findings M1-M10, P1-P7, S1-S7, copy list), `docs/plans/2026-09-04-driver-delivery-marketplace-design.md`, `docs/plans/2026-08-12-local-delivery-tracking-design.md`.

**Conventions every task follows**
- Read `apps/web/lib/supabase/admin.ts` first: service-role writes use `createAdminClient()`; typed `.rpc()` needs `adminRpc()` because the hand-written `Database` type does not satisfy supabase-js. Add any new table/column to `apps/web/lib/types/database.ts`.
- DDL cannot be run by agents. Every migration is ALSO copied to `E:/memory/watchtower/pending-sql/2026-09-04-imagine-this-auction-<name>.sql` with a line appended to that folder's `README.md` saying which app/database it is for, and a one-line note dropped in `E:/memory/watchtower/inbox/david/`.
- Tests live in `apps/web/tests/unit/*.spec.ts` (pure functions, no server) and `apps/web/tests/*.spec.ts` (Playwright e2e). Write the failing test first.
- Copy rules: no ITC anywhere, no escrow language, no fabricated stats, US dollars with two decimals, "buyer's premium" spelled that way.
- Commit after each task with a message that names the task number. Never push.
- Do not touch files owned by another task in the same batch (ownership listed per task).

---

## Batch 1 (disjoint files, may run in parallel)

### Task 1: Migration 019 — security hardening (RLS self-escalation, missing admin RPCs, audit log, org gate)

**Owns:** `apps/web/supabase/migrations/019_security_hardening_2.sql`, `apps/web/app/org/layout.tsx`, `apps/web/app/api/admin/users/[id]/role/route.ts`, `apps/web/app/api/admin/users/[id]/status/route.ts`, `apps/web/app/api/admin/auctioneers/[id]/status/route.ts`, `apps/web/tests/unit/org-gate.spec.ts`, pending-sql copy.

**Spec:**
1. `REVOKE UPDATE (role, is_approved) ON public.users FROM authenticated, anon;` and `REVOKE UPDATE (is_approved, approval_date) ON public.auctioneers FROM authenticated, anon;` (column-level revoke; table-level UPDATE stays so profile edits keep working).
2. `CREATE FUNCTION public.protect_privileged_columns()` BEFORE UPDATE trigger on `users` (raises `insufficient_privilege` if `NEW.role <> OLD.role OR NEW.is_approved <> OLD.is_approved` and `get_user_role() <> 'admin'` and `current_user <> 'service_role'`... use `auth.role()` / `current_setting('request.jwt.claims', true)` checks; service-role bypasses RLS but not triggers, so the trigger must allow `auth.uid() IS NULL` sessions, i.e. service role) and the equivalent on `auctioneers` for `is_approved, approval_date`.
3. Create the RPCs the admin routes already call. Read both route files to match the exact parameter names and return shapes they expect (they were written against `20240101000005_admin_audit_system.sql.disabled`; copy the function bodies from that file, fix them against the live `audit_log` columns `user_id, action, table_name, record_id, old_values, new_values`), `SECURITY DEFINER`, admin-only guard inside.
4. Rewrite `log_admin_action` (from `005_admin_support.sql:298-336`) to insert into the real `audit_log` columns. Add a `log_admin_action` call to the auctioneer approve/reject route.
5. `apps/web/app/org/layout.tsx`: require `role === 'auctioneer' && is_approved === true`; unapproved auctioneers get redirected to `/org/pending` (create a minimal page: "Your application is under review").
6. Add explicit `storage.objects` policies for bucket `auctioneer-licenses`: owner SELECT on own folder, admin ALL (mirror the `delivery-proofs` pattern in 018).
7. Unit test: extract the gate predicate into `apps/web/lib/auth/org-gate.ts` (`canAccessOrg({role, is_approved})`) and test true/false matrix.

**Verify:** `npm run test:unit -- org-gate`; `npx tsc --noEmit -p apps/web` shows no NEW errors in touched files (the repo has pre-existing TS errors; compare counts before/after). Commit: `Task 1: migration 019 security hardening + org approval gate`.

### Task 2: Legal, pricing, contact pages, footer, terms checkbox

**Owns:** `apps/web/app/pricing/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/privacy/page.tsx`, `apps/web/app/refunds/page.tsx`, `apps/web/app/contact/page.tsx`, `apps/web/components/navigation/footer.tsx`, `apps/web/app/layout.tsx` (add footer only), `apps/web/components/navigation/navbar.tsx` (add Pricing link only), `apps/web/components/auth/auth-form.tsx` (terms checkbox on signup only), `apps/web/tests/legal-pages.spec.ts`.

**Spec (content is real, not placeholder):**
- **/pricing** two columns. Bidders: free to register and bid; card on file, charged only when you win; you pay hammer price + the auctioneer's stated buyer's premium (typically 10%, shown on every lot) + sales tax where the auctioneer collects it + shipping or local delivery if chosen. Auctioneers: 1.2% of hammer, founding rate locked for life for accounts approved before the standard rate takes effect; standard rate 2%; billed monthly, charged to your card on file; you process card payments through your own PaymentCloud merchant account at your negotiated rate; $0 monthly, listing, per-bid, per-auction, or webcast fees; AI listing tools billed per use in dollars on the same monthly statement (link to a rate line "see current AI tool prices in your dashboard"). Comparison table vs HiBid with correct numbers (2% hammer, $0.25/unique bid capped $150/auction, $75 webcast setup, $195 listing-only, software $95–$295/mo) and a caption "HiBid and AuctionFlex 360 published pricing, September 2026".
- **/terms** sections: acceptance; accounts; bidder terms (bids are binding, card on file, buyer's premium, sales tax, non-payment: the winning card is charged after close, failed charges may suspend the account); auctioneer terms (own merchant account, accurate descriptions, fulfillment, platform fee 1.2%/2%, monthly statement, licensing); auction conduct (anti-sniping extension, reserves, auctioneer may cancel); items sold as-is; disputes go first to the auctioneer, ITA may mediate; local delivery service terms (ITA is the delivery provider, drivers are independent contractors, declared-value caps, 48-hour damage claim window); prohibited items; limitation of liability; governing law `[STATE]` (single bracketed field David fills); changes; contact.
- **/privacy**: what we collect (account, bids, card tokenized by our payment processor, we never store full card numbers; driver license/insurance documents; driver location only during an active delivery with consent), how used, sharing (payment processor, delivery drivers get buyer name and address only for their job, email provider), retention, your rights, cookies, children, contact.
- **/refunds**: bidder card charges are for won lots and are final except: item not as described (contact auctioneer within 7 days), auctioneer cancels, duplicate charge; chargebacks; delivery fee refunds (full before pickup, admin review after).
- **/contact**: support@imaginethisauction.com, response within one business day, mailing address line left as `[MAILING ADDRESS]`.
- **Footer**: Auctions · How it works · Pricing · Drive for us (links to `/drive`, create a one-paragraph placeholder page only if it does not exist — Task 8 owns the real page) · Terms · Privacy · Refunds · Contact · © 2026 Imagine This Auction.
- **Signup**: required checkbox "I agree to the Terms of Service and Privacy Policy" with links; submit disabled until checked; store `terms_accepted_at` on the user profile if the column exists, otherwise add it in a tiny migration `019b_terms_accepted.sql` (do NOT renumber Task 1's file).

**Verify:** Playwright test opens each route and asserts a distinctive heading and that the footer contains all links; `npm run test:e2e -- legal-pages` (server required; if the local server cannot start, run the unit-style check of the footer link list instead and say so). Commit: `Task 2: legal, pricing, contact pages, footer, terms checkbox`.

### Task 3: Marketing and lot-page copy on the new model

**Owns:** `apps/web/app/page.tsx`, `apps/web/app/how-it-works/page.tsx`, `apps/web/components/marketplace/lot-detail.tsx`, `apps/web/lib/pricing/premium.ts` (new), `apps/web/tests/unit/premium.spec.ts`.

**Spec:**
- Remove: "Trusted by 120+ Auctioneers", "5,000+ Successful Auctions", "98% Satisfaction Rate", "24/7 Support", "thousands of bidders", "most affordable on the market", "Real numbers from a real auctioneer", the "0.1s vs 30s+" block, every ITC / credit-pack section, every escrow claim, "Instant Payouts", "under 10 minutes", "60 seconds", "Verified auctioneers only" → "Licensed auctioneers, reviewed before listing".
- Replace the social-proof bar with true statements: "Founding auctioneers keep 1.2% for life", "No per-bid, listing, or webcast fees", "Bid with a card on file, pay only when you win", "Local delivery by vetted drivers".
- Comparison table: same numbers and caption as Task 2's pricing page (single source: create `apps/web/lib/pricing/competitors.ts` exporting the rows and reuse it in both pages — coordinate: Task 3 creates the file; Task 2 imports it if it exists at merge time, otherwise inlines and Task 3 refactors).
- How it works: bidder flow = register with a card → bid → win → your card is charged hammer + buyer's premium → pick up, ship, or local delivery. Auctioneer flow = apply → approved → connect your PaymentCloud account → list (AI Quick List) → sell → paid straight to your bank → 1.2% statement monthly.
- Lot page: new `PremiumDisclosure` block under the current bid: "Buyer's premium {pct}% · If you win at {currentBid} you pay {total}" using `computeTotal(hammerCents, premiumPct)` from `lib/pricing/premium.ts` (`ROUND(hammer * pct / 100)` to match SQL). Unit test the rounding on 3 values including a half-cent case.
- Placeholder lots: each sample card gets a visible "Sample" badge and no bid counts.

**Verify:** `npm run test:unit -- premium`; grep the three owned files for `ITC|escrow|120+|5,000|98%|24/7` returns nothing. Commit: `Task 3: marketing and lot copy on card-on-file model, premium disclosure`.

---

## Batch 2 (payments core, sequential, single owner at a time)

### Task 4a: NMI client library, env, webhook signature

**Owns:** `apps/web/lib/payments/nmi.ts`, `apps/web/lib/payments/nmi-types.ts`, `apps/web/tests/unit/nmi-client.spec.ts`, `apps/web/app/api/webhooks/nmi/route.ts`, `.env.example` (payment section), `docs/PAYMENTS.md` (replaces `docs/PAYMENTCLOUD.md`).

**Spec:**
- Env: `NMI_SECURITY_KEY` (server), `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` (Collect.js), `NMI_WEBHOOK_SIGNING_KEY`, `NMI_PLATFORM_PROCESSOR_ID` (ITA's own MID for platform fees and delivery), `NMI_API_URL` default `https://secure.nmi.com/api/transact.php`. Sandbox default security key `6457Thfj624V5r7WUwc5v6a68Zsd6YEm` ONLY when `NODE_ENV !== 'production'` and the var is unset.
- `nmi.ts` exports: `addCustomerVault({paymentToken, firstName, lastName, email}) → {customerVaultId, last4, brand, expMonth, expYear}` (Direct Post `customer_vault=add_customer` with `payment_token`); `validateCard(customerVaultId)` (`type=validate`, fall back to `auth` $1 + `void` if validate unsupported); `sale({customerVaultId, amountCents, processorId?, orderId, orderDescription, tax?, shipping?, ipAddress?})`; `refund({transactionId, amountCents?})`; `void({transactionId})`; `parseResponse(body)` (URL-encoded `response=1|2|3`, `responsetext`, `authcode`, `transactionid`, `avsresponse`, `cvvresponse`, `response_code`). Amount formatting to `"12.34"`. All network via `fetch` injected for tests.
- Webhook route: NMI webhooks send header `webhook-signature: t=<ts>,s=<hex>`; verify `HMAC-SHA256(signingKey, ts + "." + rawBody)` with `timingSafeEqual`, reject if `|now - ts| > 5 min`. Parse `event_type` (`transaction.sale.success`, `transaction.sale.failure`, `transaction.refund.success`, `transaction.void.success`, `settlement.batch.complete`, chargeback events if enabled) and upsert `payment_events` keyed on `provider_event_id = event_id` with `provider='nmi'`; dispatch to handlers registered in `lib/payments/nmi-handlers.ts` (Task 4c fills them; 4a leaves a no-op registry with one test).
- Delete `apps/web/app/api/webhooks/paymentcloud/route.ts`, `apps/web/app/api/payments/card/create/route.ts`, `apps/web/app/api/payments/reconcile/daily/route.ts`, `apps/web/lib/payments/config.ts` credit packs (keep the file only if something else imports it; otherwise delete), `apps/web/lib/payments/types.ts` PaymentCloud schema.
- Tests: parseResponse on approved/declined/error bodies; sale builds the right form fields incl. `processor_id`; webhook signature accept/reject/expired; registry dispatch.

**Verify:** `npm run test:unit -- nmi`. Commit: `Task 4a: NMI client, webhook verification, remove PaymentCloud stub`.

### Task 4b: Bidder card on file (Collect.js) and bid gating

**Owns:** `apps/web/supabase/migrations/020_payment_methods.sql`, `apps/web/app/api/payments/methods/route.ts` (GET/POST/DELETE), `apps/web/components/payments/card-on-file-form.tsx`, `apps/web/app/account/payment/page.tsx`, `apps/web/components/marketplace/bidding-panel.tsx`, `apps/web/lib/payments/methods.ts`, `apps/web/tests/unit/bid-gate.spec.ts`, `apps/web/tests/card-on-file.spec.ts`.

**Spec:**
- Migration 020: `bidder_payment_methods (id, user_id unique, provider 'nmi', customer_vault_id, card_brand, last4, exp_month, exp_year, verified_at, created_at, updated_at)`, RLS: owner SELECT (no vault id exposed — use a view `bidder_payment_methods_public` with `security_invoker` exposing brand/last4/exp only), all writes via service role. Add to `Database` types.
- POST `/api/payments/methods` body `{paymentToken, firstName, lastName}` → `addCustomerVault` → `validateCard` → upsert row → `{brand, last4, expMonth, expYear}`. Rate limit 5/min per user (reuse the in-memory limiter pattern from the AI routes).
- `card-on-file-form.tsx`: loads Collect.js `<script src="https://secure.nmi.com/token/Collect.js" data-tokenization-key=...>` (public key from env), inline hosted fields for number/expiry/cvv, submits token to the API, shows brand/last4 on success, error text on decline. No spinner: use the project's progress bar convention.
- `bidding-panel.tsx`: remove every wallet reference (`walletBalance`, "Add Credits", ITC text); `canBid()` becomes `user && isAuctionLive() && hasCardOnFile && !isUserHighBidder()`; if no card, show "Add a card to bid" → `/account/payment?next=<lot>`; bid button shows `Bid $X.XX`; below it "Buyer's premium {pct}% · Total if you win ${total}" via `lib/pricing/premium.ts` (from Task 3); input placeholder in dollars ("Min $25.00"), convert to cents on submit. Extract the gate into `lib/payments/bid-gate.ts` and unit test it.
- Do not change `place_bid` here (Task 4c).

**Verify:** `npm run test:unit -- bid-gate`; e2e (if server available): visiting `/account/payment` renders the Collect.js container. Commit: `Task 4b: bidder card on file via NMI Customer Vault, bid gate without wallet`.

### Task 4c: Auction close → invoice → charge under the auctioneer's processor; migration 021

**Owns:** `apps/web/supabase/migrations/021_card_on_file_bidding.sql`, `apps/web/app/api/auctions/[id]/close/route.ts`, `apps/web/app/api/invoices/[id]/charge/route.ts`, `apps/web/app/api/invoices/[id]/refund/route.ts`, `apps/web/lib/payments/nmi-handlers.ts`, `apps/web/lib/payments/invoice-charge.ts`, `apps/web/components/bidder/invoices-dashboard.tsx`, `apps/web/tests/unit/invoice-charge.spec.ts`.

**Spec:**
- Migration 021: `auctioneers.gateway_processor_id TEXT`, `auctioneers.payments_enabled BOOLEAN DEFAULT false`, `auctioneers.merchant_status TEXT DEFAULT 'none'` (Task 6 extends). `invoices`: `payment_status TEXT NOT NULL DEFAULT 'unpaid'` CHECK in (`unpaid, processing, paid, failed, refunded, partially_refunded, disputed`), `gateway_transaction_id TEXT`, `paid_at`, `failure_reason`, `attempts INT DEFAULT 0`, `last_attempt_at`; keep `is_paid` and set it true when `payment_status='paid'` (existing ship/delivery code reads it). New `place_bid(p_lot_id, p_user_id, p_amount)` (single final definition, drop the other four in this migration): no wallet hold, requires a `bidder_payment_methods` row with `verified_at`, keeps proxy bidding, outbid notification, anti-sniping from `011`. New `process_auction_end`: invoice hammer + premium, `platform_commission_amount = ROUND(hammer * rate/100)` where rate comes from `platform_settings.commission_rate` (create `platform_settings` key/value table seeded `commission_rate=1.2`, `standard_commission_rate=2.0`) or `auctioneers.commission_rate_override`; NO wallet writes. Drop `release_escrow_on_shipping` and stop writing `payouts_due` (leave table). Auctions cannot go live unless `auctioneers.payments_enabled` (add CHECK via trigger on `auctions.status` transition to `active`).
- `lib/payments/invoice-charge.ts`: `chargeInvoice(invoiceId)` → loads invoice + auctioneer processor_id + bidder vault → `sale({processorId, amountCents: total_amount, orderId: invoice.id})` → on approve set `paid`, write `payment_events`, notification "Payment received"; on decline set `failed` with reason, notification "Payment failed, update your card", attempts++. Idempotent: refuse if `processing/paid`.
- Close route: after `process_auction_end`, call `chargeInvoice` for each new invoice (await sequentially; failures do not abort the loop). Add a cron `apps/web/app/api/cron/retry-failed-charges/route.ts` (CRON_SECRET bearer, daily, retries `failed` with attempts < 3 and a card updated after last attempt) and register it in `apps/web/vercel.json`.
- Charge route (auctioneer/admin manual retry) and refund route (auctioneer/admin, full or partial → `refund`, update status). `nmi-handlers.ts`: refund/void/chargeback events update `payment_status`; chargeback → `disputed` + admin notification.
- Invoices dashboard: "Pay Now" becomes "Retry payment" (calls charge route) only when `failed`; show status pill; remove "Payment Required" ITC copy; hammer, premium (with %), total.
- Unit test `chargeInvoice` with a mocked NMI client: approve → paid; decline → failed; second call on paid → no-op.

**Verify:** `npm run test:unit -- invoice-charge`; SQL reviewed by reading. Pending-sql copies for 020 + 021 with README/inbox notes. Commit: `Task 4c: card-on-file bidding, invoice charge under auctioneer processor, migration 021`.

### Task 4d: Remove the wallet and ITC; AI usage in dollars

**Owns:** delete `apps/web/app/wallet/**`, `apps/web/components/wallet/**`, `apps/web/app/api/wallet/**`, `apps/web/lib/wallet/**`, `apps/web/scripts/fund-reviewer-wallet.js`, `apps/web/tests/unit/wallet-balance.spec.ts`, `apps/web/tests/paymentcloud-credit-purchase.spec.ts`, `apps/web/tests/escrow-flow.spec.ts`; modify `apps/web/lib/ai/credits.ts`, `apps/web/components/org/quick-list/credit-cost-button.tsx`, `apps/web/components/org/quick-list/quick-list-workspace.tsx`, `apps/web/components/admin/ai-controls.tsx`, `apps/web/app/api/admin/ai/**`, `apps/web/components/navigation/navbar.tsx` (remove wallet link), `apps/web/app/dashboard/page.tsx`, `apps/web/components/org/org-sidebar.tsx`, `apps/web/supabase/migrations/022_ai_usage_dollars.sql`, `apps/web/tests/unit/ai-usage.spec.ts`, `docs/AI_QUICK_LISTING.md`.

**Spec:**
- Migration 022: `ai_action_prices.price_cents INT` (seed: identify 5¢→ set 25, draft 50, condition 25, image_cleanup 75, image_studio 100, image_lifestyle 125 — David can edit in admin), `auctioneer_usage_charges (id, auctioneer_id, action_key, amount_cents, artifact_ref, statement_id NULL, created_at)`. `ai_credit_ledger` stays as the reserve/settle guard but amounts are cents and settlement inserts a `auctioneer_usage_charges` row instead of touching any wallet. Remove `get_wallet_balance`, `add_wallet_credits`, `ai_available_credits` dependency on wallet (available = always true unless auctioneer is suspended or `payments_enabled=false`).
- UI: credit-cost button shows "$0.50 per draft, billed on your monthly statement"; admin AI controls edit `price_cents`; org sidebar shows "This month's AI usage: $X.XX".
- Grep the whole `apps/web` for `ITC`, `wallet`, `credit pack`, `escrow` and remove or reword every hit outside the deleted folders (list what you changed in the commit body).

**Verify:** `npm run test:unit` all green; `npx tsc --noEmit` no new errors; `npm run build` succeeds (ignoreBuildErrors is on; confirm no runtime import of deleted modules). Commit: `Task 4d: remove ITC wallet, AI usage billed in dollars`.

### Task 5: Monthly auctioneer statement and auto-charge

**Owns:** `apps/web/supabase/migrations/023_statements.sql`, `apps/web/lib/billing/statements.ts`, `apps/web/app/api/cron/monthly-statements/route.ts`, `apps/web/app/api/admin/statements/**`, `apps/web/app/org/billing/page.tsx`, `apps/web/components/org/billing-statement.tsx`, `apps/web/components/admin/statements-manager.tsx` (+ admin dashboard tab), `apps/web/tests/unit/statements.spec.ts`, `apps/web/vercel.json` (cron 1st of month 06:00 UTC).

**Spec:** `auctioneer_billing_profiles (auctioneer_id unique, customer_vault_id, last4, brand, commission_rate NUMERIC default from platform_settings, founding BOOLEAN)`; `auctioneer_statements (id, auctioneer_id, period_start, period_end, hammer_total_cents, commission_cents, ai_usage_cents, delivery_adjustments_cents, total_cents, status unpaid/paid/failed, gateway_transaction_id, pdf_path NULL, created_at, paid_at)`. `buildStatement(auctioneerId, period)` pure function over paid invoices + usage rows (unit test with fixtures incl. refunds reducing hammer); cron creates statements, charges via `sale({processorId: NMI_PLATFORM_PROCESSOR_ID})`, emails via Resend using the existing email helper, marks usage rows with `statement_id`; failure → dunning email + retry in 3 days; auctioneer page shows statements; admin tab shows all with retry. Card capture for auctioneers reuses `card-on-file-form.tsx` posting to `/api/billing/payment-method`.

**Verify:** `npm run test:unit -- statements`. Commit: `Task 5: monthly auctioneer statements with auto-charge`.

### Task 6: PaymentCloud merchant application flow

**Owns:** `apps/web/supabase/migrations/024_merchant_applications.sql`, `apps/web/app/org/payments/**`, `apps/web/app/api/merchant-applications/**`, `apps/web/app/api/admin/merchant-applications/**`, `apps/web/components/org/merchant-application-form.tsx`, `apps/web/components/admin/merchant-applications-manager.tsx` (+ admin tab), `apps/web/lib/merchant/state.ts`, `apps/web/tests/unit/merchant-state.spec.ts`.

**Spec:** table `merchant_applications (id, auctioneer_id unique, status draft/submitted/in_review/approved/rejected/needs_info, legal_name, dba, entity_type, ein_last4, address jsonb, website, phone, owner_name, owner_title, ownership_pct, years_in_business, est_monthly_volume_cents, avg_ticket_cents, high_ticket_cents, refund_policy_text, categories text[], prior_processing BOOLEAN, pc_merchant_id, gateway_processor_id, submitted_at, reviewed_at, reviewed_by, review_notes, hosted_application_url, created_at, updated_at)` + `merchant_application_events` append-only. **No bank account, no SSN, no full EIN stored**; the form's last step shows the PaymentCloud hosted application link from `platform_settings.pc_hosted_application_url` (admin-editable; David pastes Sam's link) with copy "Finish your bank and identity verification securely with PaymentCloud." Status machine in `lib/merchant/state.ts` (unit test transitions). On admin `approve` with `gateway_processor_id`: set `auctioneers.gateway_processor_id`, `payments_enabled=true`, `merchant_status='approved'`, audit row, notification. Org page shows status timeline; admin tab lists, filters, approves/rejects/needs-info with notes.

**Verify:** `npm run test:unit -- merchant-state`. Commit: `Task 6: merchant application flow with PaymentCloud hosted handoff`.

---

## Batch 3 (delivery marketplace, after Batch 2 lands)

### Task 7: Delivery phase 2 — rates, quote, buyer checkout, driver self-signup + approval

**Owns:** `apps/web/supabase/migrations/025_delivery_marketplace.sql` (all new columns/tables from the design's "New data" section except payouts/claims), `apps/web/lib/delivery/quote.ts`, `apps/web/lib/delivery/geo.ts` (Google Geocoding + Distance Matrix, key `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` server-side read as `GOOGLE_MAPS_API_KEY` fallback), `apps/web/app/api/delivery/quote/route.ts`, `apps/web/app/api/delivery/checkout/route.ts` (charges `sale` on `NMI_PLATFORM_PROCESSOR_ID`), `apps/web/components/bidder/delivery-checkout.tsx`, `apps/web/app/drive/page.tsx`, `apps/web/app/driver/apply/**`, `apps/web/app/api/driver/apply/route.ts`, `apps/web/components/admin/driver-applications.tsx`, `apps/web/app/api/admin/drivers/**`, `apps/web/components/admin/delivery-rates.tsx`, `apps/web/tests/unit/delivery-quote.spec.ts`.

**Spec:** per the design doc. Quote = `base_cents + round(miles * per_mile_cents)`; driver payout = `round(price * driver_share_pct/100)`; unit test with the four tiers. Buyer flow on a `paid` invoice only. Driver documents bucket `driver-documents` private with explicit owner/admin storage policies.

**Verify:** `npm run test:unit -- delivery-quote`. Commit: `Task 7: delivery rates, quote, buyer checkout, driver self-signup`.

### Task 8: Delivery phase 3 — job board, ping waves, SMS, online toggle

**Owns:** `apps/web/lib/delivery/matching.ts`, `apps/web/app/api/cron/delivery-waves/route.ts` (+ vercel.json every minute), `apps/web/app/api/driver/jobs/route.ts` (open jobs list), `apps/web/app/driver/page.tsx` (Open jobs tab, earnings placeholder, online toggle), `apps/web/lib/notifications/sms.ts` (Twilio; env `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`), `apps/web/tests/unit/delivery-matching.spec.ts`.

**Spec:** eligibility + wave escalation (10 mi / 25 mi / all, 10-minute steps) as pure functions with haversine distance; atomic claim already exists (verify and test); SMS only for `sms_opt_in`; admin sees `wave` and `wave_expires_at` in the delivery detail.

**Verify:** `npm run test:unit -- delivery-matching`. Commit: `Task 8: driver job board, ping waves, SMS`.

### Task 9: Delivery phase 4 — Stripe Connect Express payouts, damage claims

**Owns:** `apps/web/lib/payouts/stripe-connect.ts`, `apps/web/app/api/driver/stripe/**`, `apps/web/app/api/cron/driver-payouts/route.ts`, `apps/web/app/api/delivery/[id]/claim/**`, `apps/web/components/admin/damage-claims.tsx`, migration `026_driver_payouts_claims.sql`, `apps/web/tests/unit/payout-hold.spec.ts`.

**Verify:** `npm run test:unit -- payout-hold`. Commit: `Task 9: driver payouts via Stripe Connect, damage claims`.

---

## Final: full review and handoff
Dispatch a final code reviewer over `git diff <checkpoint>..HEAD`; run `npm run test:unit`, `npm run build`; update `docs/audits/2026-09-04-launch-economics-audit.md` with a "Resolved" column; close board rows with results; write the pending-SQL index for David (019, 019b, 020–026 in order).
