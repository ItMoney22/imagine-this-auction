# Launch Economics, Payments & Copy Audit — 2026-09-04

Scope: fee math (buyer's premium, auctioneer commission, ITC), payment processing readiness for
PaymentCloud, auctioneer onboarding + merchant-application design, and customer-facing copy.
Compared against HiBid (primary), Proxibid, LiveAuctioneers, Invaluable. Findings verified against
the repo (`apps/web`, canonical migrations in `apps/web/supabase/migrations`) AND the live Supabase
database (`qdiodkevkacgbfvplafm`, read-only, 2026-09-04).

## 0. Verdict in five lines

1. **The numbers only work if auctioneers carry their own processing.** 1.2% of hammer cannot
   survive a ~3.5%–4% high-risk processing cost if ITA is the merchant of record. With
   per-auctioneer PaymentCloud accounts (the plan), 1.2% + referral residuals is a viable wedge
   (HiBid effective ~3%+, Proxibid/LiveAuctioneers 5%).
2. **The prepaid ITC wallet is incompatible with that plan** and is broken as built: 1 ITC = 1¢ in
   the bidding engine but ~10¢ in the store (10× overcharge), the premium is invoiced but never
   collected, and no invoice can be paid, so no auctioneer can ever be paid out.
3. **Nothing charges a card today.** The PaymentCloud "integration" is a stub + a webhook that
   mints credits from an unauthenticated body.
4. **Critical security hole, confirmed live:** any logged-in user can set their own `role='admin'`
   through the public API. Must be fixed before any merchant/bank data enters the system.
5. **The site cannot pass a processor's underwriting review today:** no Terms, Privacy, Refund
   policy, Contact page, or pricing page; fabricated stats on the homepage; buyer's premium not
   disclosed at the point of bid.

## 1. Competitor fee benchmarks (Sept 2026, published rate cards)

| Platform | Auctioneer pays platform | Bidder pays platform | Buyer's premium | Payments |
|---|---|---|---|---|
| **HiBid / AuctionFlex 360** | 2% of hammer + $0.25/unique bid (cap $150/auction) + $75 webcast setup; $195 listing-only; $1/card auth (cap $50). Software $95–$295/mo. | $0 | 10–18%, **set by and kept by the auctioneer** | Auctioneer's own merchant account (Global Payments integrated). Bidder card on file at registration ($1 auth); auctioneer charges after close. HiBid never holds funds. |
| **Proxibid** | 5% hammer (Arts/Estate/Firearms/Other); 3% vehicles; 2% farm/heavy equipment. Timed event $275, live $675 + per-lot. | $0 (houses pass through) | Auctioneer's | atgPay 3.99% + $0.25 (4.49% high-risk); ACH 1% + $0.50 |
| **LiveAuctioneers** | 5% hammer all categories. Timed $275, live $525–$895/day. | $0 | Auctioneer's (online BP often 25–28%) | LivePayments 3.99% + $0.25 (4.49% high-risk) |
| **Invaluable** | Tiered ~4% → 1% by lot value | $0 | Auctioneer's | House's own |
| **ImagineThisAuction (as marketed)** | 1.2% hammer, $0 everything else, "locked forever" | $0 (but must pre-buy ITC) | 10% default (DB), **currently kept by the platform** | None working |

Homepage comparison-table corrections: HiBid webcast is **$75**/auction (site says $25); HiBid has
no flat "per-auction fee" — it is the $0.25/bid cap ($150) + webcast. Cite "HiBid, AuctionFlex 360
published pricing, Sept 2026" under the table.

## 2. Does 1.2% work? Worked numbers ($50K/mo GMV auctioneer, 10% BP → $55K charged)

| Model | Who processes | Processing cost (~3.5% + $0.25) | ITA revenue | Auctioneer keeps |
|---|---|---|---|---|
| **A. Auctioneer's own PaymentCloud MID (recommended)** | Auctioneer | Auctioneer pays ≈ $1,925 (same as on HiBid) | $600 commission + ≈ $100–250 PaymentCloud ISV residual | $55K − processing − $600 |
| B. ITA merchant of record, ITC escrow (as built) | ITA | ITA pays ≈ $1,925 | $600 − $1,925 = **−$1,325/mo** unless ITA keeps the $5,000 BP | Hammer − 1.2% only, loses BP |
| HiBid today | Auctioneer | Auctioneer pays ≈ $1,925 | — | $55K − processing − $1,000 − ~$300 bid fees − $300 webcast − $145 software |

Model B only "works" if ITA keeps the whole buyer's premium (11.2% effective take), which the
industry gives to the auctioneer and which the copy ("just 1.2%") contradicts. **Model A is the one
where 1.2% is honest and profitable.** Model A also removes money-transmitter/stored-value exposure,
chargeback liability on every lot, 1099-K duties, and the need to build payout rails.

## 3. Money-math findings (code + live DB)

| # | Sev | Finding | Where |
|---|---|---|---|
| M1 | Blocking | **ITC exchange rate is 10× inconsistent.** Engine/UI: 1 ITC = 1¢ (`formatCurrency` prints `$1.00 (100 ITC)`). Store: 100 ITC = $9.99. A $9.99 pack buys $1.00 of bidding power. | `apps/web/lib/utils.ts:8-23`, `apps/web/lib/payments/config.ts:16-41`, `components/wallet/credit-packs.tsx:152,175` |
| M2 | Blocking | **Invoices can never be paid.** No pay route; "Pay Now" has no handler; nothing sets `invoices.is_paid`. Ship route requires `is_paid`, so `release_escrow_on_shipping` never runs, so `payouts_due` is never written. Live DB: 0 invoices, 0 paid, 0 payment events. | `components/bidder/invoices-dashboard.tsx:67-73`, `app/api/invoices/[id]/ship/route.ts:99-105` |
| M3 | Blocking | **Buyer's premium is invoiced but never collected.** Bid hold covers hammer only; `process_auction_end` writes an `escrow_hold` of amount 0. Bid gate (`canBid`) checks hammer only, so a bidder can be told they can afford a lot and be short the premium. | `003_indexes_functions.sql:303-351`, `components/marketplace/bidding-panel.tsx:124-130` |
| M4 | High | **Platform keeps 100% of BP + 1.2% of hammer** (payout = hammer − 1.2%). Industry: BP is the auctioneer's. Copy says "just 1.2%". Decide (see §7). | `003_indexes_functions.sql:406-408` (live DB confirmed) |
| M5 | High | Commission is a hard-coded literal (1.2) in two SQL functions; BP is per-auction in DB but has no UI (always the 10.00 default). No per-org rate, no admin setting. | `003:407`, `005_admin_support.sql:246`, `components/org/auction-form.tsx` |
| M6 | High | Admin financials are wrong: `get_financial_summary` computes 1.2% of ITC *top-ups* not hammer; `invoices.platform_commission_amount` never written (view sums 0); admin "commission owed" tile actually shows seller net payout (~82× too big). | `005:209-246`, `app/api/admin/auctioneers/route.ts:152-165` |
| M7 | Med | Three wallet-balance derivations coexist (SQL last-row `balance_after`, SQL SUM/CASE, TS sign table) and `003`'s bid_hold sign convention is opposite the later ones. | `lib/wallet/balance.ts`, `003:39-54,209`, `20240130000001_fix_place_bid.sql` |
| M8 | Med | `place_bid` is defined 5× and lexicographic order applies the `2024…` files last, so a **fresh rebuild** loses proxy bidding + outbid notifications. (Live DB was previously verified to have the full version; this is a rebuild hazard, not a live bug.) | `003`, `010`, `011`, `20240101000004`, `20240130000001` |
| M9 | Med | No sales-tax line, rate, or nexus logic anywhere. | `invoices` schema |
| M10 | Low | Seed data uses 8/10/12/15% premiums inconsistently. Live DB has 2 auctions at 10 and 12. | `scripts/seed-*.js`, `seed-test-data.js:274` |

## 4. Payment-processing readiness (PaymentCloud)

**State:** scaffold only. `POST /api/payments/card/create` records an intent row and returns
`requiresProviderSetup: true`; no gateway is ever called. The webhook is the only thing that mints
credits.

| # | Sev | Finding | Where |
|---|---|---|---|
| P1 | Critical | Webhook "signature" is a bearer compare of the raw secret, not an HMAC over the body. `userId` and `creditAmount` come from the body. Anyone with the secret mints unlimited ITC to any account. | `app/api/webhooks/paymentcloud/route.ts:14-20,96-103`, `lib/payments/types.ts:18` |
| P2 | High | Intent row and webhook never join (`provider_event_id` is our UUID vs their eventId). Intent rows stay `processed=false` forever. | `app/api/payments/card/create/route.ts:61-82` |
| P3 | High | `sale.declined`, `sale.pending`, `refund.processed` silently ignored; no chargeback/dispute path, no `chargeback` transaction type, no clawback. | webhook route `:96` |
| P4 | High | No card-entry UI, no tokenization script (Collect.js / Accept.js), no gateway env vars (NMI/Authorize.Net). | `components/wallet/credit-packs.tsx:38-84` |
| P5 | Med | `POST /api/payments/reconcile/daily` is an unauthenticated 12-line stub, not in `vercel.json` crons. | `app/api/payments/reconcile/daily/route.ts` |
| P6 | Med | No rate limit on card create (card-testing is the #1 high-risk MID fraud vector). | same |
| P7 | Med | Copy leaks build state: "Secure payment via PaymentCloud (activation pending)", "Instant credit delivery", "30-day refund policy" (no such policy exists). | `credit-packs.tsx:208-216` |

**Gateway choice (confirm with PaymentCloud today):** PaymentCloud provisions **Authorize.Net
(preferred) or NMI**. For a multi-auctioneer platform, **NMI is the better fit**: one gateway account
can hold multiple merchant processing accounts (per-auctioneer MIDs routed by `processor_id`), and
its Customer Vault is gateway-level, so a bidder's card is tokenized **once** and charged under
whichever auctioneer wins the sale. With Authorize.Net each auctioneer is a separate gateway login
and tokens do not cross accounts, so bidders would re-enter a card per auction house. Ask
PaymentCloud specifically for: NMI gateway, multi-MID under one gateway, Collect.js tokenization
key, Customer Vault, ACH, webhook events for sale/refund/chargeback, and the **ISV Platform API**
(pcdocs.paymentcloudinc.com) for merchant onboarding.

## 5. Security findings (live DB verified)

| # | Sev | Finding |
|---|---|---|
| S1 | **Critical** | `users` UPDATE policy is `id = auth.uid()` with no column restriction, and the `authenticated` role holds column UPDATE on `role` and `is_approved`. Any logged-in user can `PATCH /rest/v1/users?id=eq.<me>` `{role:'admin'}`. Confirmed on the live DB via `pg_policies` + `column_privileges`. |
| S2 | **Critical** | Same shape on `auctioneers`: applicant can set `is_approved=true`, bypassing license review. |
| S3 | High | `change_user_role` / `change_user_status` RPCs called by admin routes **do not exist** in the live DB (only in a `.disabled` migration). Admin role/status actions 500. |
| S4 | High | `log_admin_action` writes columns that `audit_log` does not have; admin audit logging fails. Auctioneer approve/reject writes no audit record. |
| S5 | Med | `/org` layout gates on role only, not `is_approved`; unapproved applicants reach `/org/auctions/new`. |
| S6 | Med | No encryption primitive anywhere (no pgcrypto, Vault, KMS). `auctioneers.tax_id` is plaintext. Nothing exists yet to hold bank data safely. |
| S7 | Med | `auctioneer-licenses` bucket has no explicit `storage.objects` policies (private by default, but no positive owner-read policy). |

Fix for S1/S2 (one migration): `REVOKE UPDATE (role, is_approved) ON users FROM authenticated, anon`;
`REVOKE UPDATE (is_approved, approval_date) ON auctioneers FROM authenticated, anon`; plus a
`BEFORE UPDATE` trigger that raises if `role`/`is_approved` change and `get_user_role() <> 'admin'`.

## 6. Copy findings

**Missing pages (404 in production, no footer exists at all):** `/pricing`, `/terms`, `/privacy`,
`/about`, `/faq`, `/contact`, refund/returns, shipping policy. Signup has no Terms checkbox.
PaymentCloud's underwriter (and card brands) will look for Terms, Privacy, Refund policy, Contact
info, and a clear product/pricing description on the live domain. **These block "getting payment
processing today" as much as the code does.**

**Fabricated / unverifiable claims (remove or replace):** "Trusted by 120+ Auctioneers",
"5,000+ Successful Auctions", "98% Satisfaction Rate", "24/7 Support" (no contact channel),
"thousands of bidders", "most affordable on the market", "Real numbers from a real auctioneer",
"0.1s vs 30s+" benchmark, "Instant credit delivery", "30-day refund policy".

**Contradictions:**
- "No Hidden Fees. Ever." / "Just 1.2%" vs a 10% buyer's premium disclosed on exactly one page
  (`/how-it-works`) and **never on the lot page or bid button**.
- "Escrow holds funds until you confirm receipt" (3 places) vs "Get paid as soon as items ship"
  (homepage) vs code: releases on `is_shipped`.
- "Under 10 minutes / no onboarding calls" vs "Admins must verify the license" on the apply page.
- "No setup or onboarding costs" vs AI Quick-List charges auctioneers ITC per action.
- "We only make money when you make money" vs ITC pack sales + AI credit sales.
- Bid input placeholder shows raw cents (`Min: 2500`) with no unit; button shows `$25.00 (2500 ITC)`.
- Six hardcoded placeholder lots show fake bid counts on the homepage when inventory is empty.

## 7. Recommendations

### 7.1 Payment model — pick A (auctioneer's own MID), retire ITC for bidding
- Bidder registers with a card (Collect.js hosted fields → NMI Customer Vault token). $1 auth on
  registration like HiBid; optional per-auction registration approval by the auctioneer.
- Bid freely; no pre-funding. Win → invoice (hammer + auctioneer's BP + tax/shipping later) →
  charged to the card on file under the **auctioneer's** `processor_id`, or bidder pays via hosted
  page. Funds settle to the auctioneer's bank. ITA never touches buyer money.
- ITA bills each auctioneer **1.2% of hammer monthly** (statement + auto-charge to the auctioneer's
  card on file via ITA's own MID), exactly how HiBid bills its 2%. ITA also earns PaymentCloud ISV
  residuals on referred merchants.
- ITC stays only as the AI-tools credit currency for auctioneers (reserve/settle already works),
  repriced at 1 ITC = 1¢ with packs at par (e.g. $10 → 1,000 ITC). Or drop ITC entirely and price AI
  actions in dollars on the monthly statement.
- Escrow copy goes away; replace with "Buyer protection: auctioneer verified, card charged only
  after you win, disputes handled with your auctioneer."

If David wants to keep prepaid ITC bidding anyway: fix M1 (packs at par), M2 (pay-invoice route
that debits hammer + BP from wallet), M3 (hold hammer + BP at bid time or check both in `canBid`),
and accept Model B's economics (ITA is merchant of record, needs its own high-risk MID with reserves,
payout rails, 1099-K, money-transmitter review).

### 7.2 Buyer's premium — auctioneer-set, auctioneer-kept, disclosed at bid
- Expose `buyer_premium_percent` in the auction form (default 10%, allow 0–25%).
- Payout math: auctioneer receives hammer + BP; ITA's fee is 1.2% of hammer only. Update
  `release_escrow_on_shipping` (or its replacement) accordingly.
- Show "Buyer's premium: 10% · Your total if you win: $110.00" on the lot page and in the bid
  confirmation. Put it in the auction terms and the invoice with the percentage labelled.
- Do **not** add a platform-level bidder fee at launch; 0% bidder fee is the wedge against
  LiveAuctioneers/Invaluable-style online surcharges. Revisit once volume exists.

### 7.3 Auctioneer commission — keep 1.2% founding rate, make it a setting
- Add `platform_settings.commission_rate` (default 1.2) and `auctioneers.commission_rate_override`
  (nullable, "locked founding rate"). Remove the literal from SQL. Publish a standard rate (2%) for
  post-founding signups so "rates will increase" is true and enforceable in the Terms.

### 7.4 PaymentCloud merchant application ("whitelist" flow)
Build `/org/payments/apply` (approved auctioneers only) + `/admin` "Merchant Applications" tab.
- **Collect on our site (non-sensitive):** legal name, DBA, entity type, EIN, address, website,
  phone, owner name/title/ownership %, years in business, est. monthly volume, average ticket,
  highest ticket, refund policy text, category (auction/estate/firearms flag), prior processing.
- **Sensitive step (bank routing/account, owner SSN/DOB, voided check):** prefer handing off to
  PaymentCloud's hosted application via their ISV/Stratus link or Platform API so the raw data
  never lands in our DB. If it must live with us: `pgcrypto` `pgp_sym_encrypt` with a key held in
  Supabase Vault/env, write-only from the app, decrypt only inside a `SECURITY DEFINER` admin RPC
  that audit-logs every read, store `account_last4` for display, private bucket for the voided
  check/signed PDF (reuse the `auctioneer-licenses` pattern with signed URLs), rate-limit, TLS only.
  NACHA rules require encrypted storage/transmission of account+routing pairs.
- **Status machine:** `draft → submitted → in_review → approved | rejected | needs_info`, with
  `pc_merchant_id`, `gateway_processor_id`, `approved_at`, notes, and an append-only audit table.
- **After approval:** admin stores the auctioneer's gateway credentials (encrypted) → the
  auctioneer's auctions flip to "payments enabled"; bidders can register with a card on those.
- **Prereqs:** fix S1/S2 first; ship Terms/Privacy/Refund/Contact pages (underwriting will check).

### 7.5 Copy — launch list
1. Pricing page: bidder side ("Free to register and bid. You pay the hammer price plus the
   auctioneer's stated buyer's premium, typically 10%, plus tax/shipping where applicable.") and
   auctioneer side (1.2% of hammer, billed monthly; processing through your own PaymentCloud
   account at your negotiated rate; no monthly, listing, per-bid, or webcast fees).
2. Terms of Service (bidding contract, non-payment, disputes, as-is, ITC terms if kept), Privacy
   Policy, Refund/Chargeback policy, Contact page with a real email. Footer with all four.
   Terms checkbox at signup.
3. Remove fabricated stats; replace with true statements ("Founding auctioneers get 1.2% for life",
   "No per-bid fees, ever").
4. Fix the comparison table (HiBid webcast $75, cite source + date).
5. BP on lot page + bid confirm; unit-label the bid input; remove "(activation pending)",
   "Instant credit delivery", "30-day refund policy"; label sample lots as samples.
6. Reconcile escrow/payout language with whatever 7.1 decides.

## 8. Decisions needed from David
1. Payment model: **A** (auctioneer MIDs, card-on-file, no prepaid ITC for bidding) or B (ITC escrow).
2. Buyer's premium: auctioneer-kept and auctioneer-set (recommended) or platform-kept.
3. Keep ITC at all (AI credits only) or price AI in dollars.
4. Founding rate 1.2% + published standard rate 2% later?
5. Bank data: hand off to PaymentCloud hosted application (recommended) or store encrypted with us.
6. Gateway ask to PaymentCloud: NMI multi-MID (recommended) vs Authorize.Net.

## Sources
- HiBid/AuctionFlex 360 pricing: https://trial.auctionflex.com/auction-flex-360-pricing
- HiBid fee breakdown: https://gavelist.com/blog/does-hibid-charge-a-percentage-of-sales
- HiBid Global Payments processing: https://help.auctionflex.com/en/articles/15887451-understanding-your-global-payments-charges
- Proxibid rate card: https://discover.proxibid.com/master-rate-card
- LiveAuctioneers rate card: https://www.liveauctioneers.com/pages/master-rate-card/
- PaymentCloud partners (ISO/ISV, Stratus): https://paymentcloudinc.com/partners/
- PaymentCloud NMI gateway: https://paymentcloudinc.com/online/payment-gateways/nmi/
- PaymentCloud developer portal (ISV Platform API): https://pcdocs.paymentcloudinc.com/
- PaymentCloud rates (third-party reviews): https://www.merchantmaverick.com/reviews/paymentcloud-review/
- NACHA data-security rules: https://paysimple.com/blog/ach-security-requirements-for-merchants/
