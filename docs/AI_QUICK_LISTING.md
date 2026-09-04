# AI Quick Listing & Product Presentation

Auctioneers scan or photograph an item and get a near-complete draft listing in one tap. The raw
photos they took stay the buyer's source of truth, unaltered, forever.

This feature extends the existing catalog + ITC wallet architecture. It does not replace the
regular lot builder at `/org/auctions/[id]/lots` — Quick List is the fast path, the lot builder
remains the full-control path.

---

## 1. The flow

| Step | Where | What happens | Cost |
|------|-------|--------------|------|
| 1 | `/org/quick-list` | Auctioneer taps **Quick List** in the org sidebar | free |
| 2 | Scanner panel | Scan a barcode with the device camera, type a UPC/ISBN/SKU, or take/upload photos | free |
| 3 | `POST /api/ai/quick-list/identify` | Barcode/ISBN catalog lookup + OCR + photo understanding → candidate matches | `quick_list_identify` |
| 4 | Candidate picker | If matches are uncertain or conflict, the auctioneer picks. **Never auto-selected.** | free |
| 5 | `POST /api/ai/quick-list/drafts/[id]/generate` | Full draft: title, description, category, brand/model, attributes, condition notes, starting bid, duration, confidence | `quick_list_draft` |
| 6 | Review screen | Every field editable. Explicit "I have reviewed this listing" gate. | free |
| 7 | `POST /api/ai/quick-list/drafts/[id]/approve` | Creates the real `lots` row | free |
| 8 | Batch queue | "Next item" clears the bench and keeps the queue | — |

**AI drafts never auto-publish.** `approve` requires an authenticated auctioneer who owns the
target auction *and* a `confirmed_reviewed: true` acknowledgement from the review screen.

---

## 2. Auction integrity

The rules the feature is built around, and where each one is actually enforced:

| Rule | Enforcement |
|------|-------------|
| Originals are preserved unaltered | `lot_images` trigger `lot_images_protect_originals` rejects any UPDATE that changes an original's `bucket`, `storage_path`, `public_url`, `checksum_sha256` or `byte_size` |
| Originals show first and by default | `LotImageGallery` opens on the Verified Originals tab; the AI tab only appears when generated images exist |
| Generated images are separate | Own table rows (`kind='ai_generated'`), own storage bucket (`ai-generated`), own UI section |
| Every generated image is labelled | `disclosure_label` is `NOT NULL` for `kind='ai_generated'` (CHECK constraint), shown on the frame, the thumbnail and the caption |
| AI can't change item facts | `IMAGE_INTEGRITY_RULES` are injected verbatim into every prompt, after any user scene hint, and the model is told they override everything else. Only image *editing* models are used, never text-to-image |
| AI images can't be primary evidence | `is_primary` is rejected for `kind='ai_generated'` by both INSERT and UPDATE triggers; `lots.images` only ever receives verified originals |

The disclosure text is a single constant, `AI_IMAGE_DISCLOSURE` in `lib/ai/quick-listing.ts`, and
is also copied onto each row at generation time so the wording live at that moment stays auditable.

A SHA-256 checksum is computed in the browser at upload and stored with the original, so later
tampering is detectable rather than merely forbidden.

---

## 3. ITC credits

Existing wallet, extended — not a parallel currency.

### Lifecycle

```
beginAiAction()   reserve   → ai_credit_ledger row, status='pending'; wallet untouched
   ↓ provider runs
settleAiAction()  success   → wallet_ledger 'ai_spend' row; status='charged'
voidAiAction()    failure   → status='voided'; nothing ever charged
refundAiAction()  after-the-fact → wallet_ledger 'ai_refund' row; status='refunded'
```

- **Charged only on success.** The wallet is not touched until a usable result exists.
- **No overdraft.** `ai_available_credits()` = wallet balance − in-flight pending reservations, so
  two concurrent taps can't both pass a balance check for credits only one of them can have.
- **Idempotent.** `UNIQUE (user_id, idempotency_key)`. A retried or double-tapped request returns
  the stored artifact and charges nothing.
- **Not charged when nothing was produced.** Zero candidates → voided. Prohibited item → voided.
- **Serialised per user.** `pg_advisory_xact_lock` on the user id around every wallet write keeps
  the running `balance_after` correct.

### Ledger fields

`ai_credit_ledger` records user, auctioneer, action, cost, status, idempotency key, draft, lot,
image job, provider, provider job ID, the `wallet_ledger` rows for both charge and refund,
refund/failure reasons and timestamps.

### Prices

`ai_action_prices`, admin-editable at `/admin/ai` (also a tab on the main admin dashboard).
Per action: credit cost, on/off, hourly rate limit, provider, model. Changes take effect on the
next action — no deploy. Seeded defaults:

| Action | ITC | Notes |
|--------|-----|-------|
| `quick_list_identify` | 5 | barcode + vision identification |
| `quick_list_draft` | 10 | full listing draft |
| `quick_list_condition` | 5 | re-run condition notes |
| `image_cleanup` | 15 | clean background |
| `image_studio` | 20 | professional presentation |
| `image_lifestyle` | 25 | staged mockup |

### Wallet display fix

`transaction_type` gained `ai_spend` and `ai_refund`. The balance was previously recomputed by a
copy-pasted `switch` in three places, each silently ignoring unknown types — AI spending would not
have shown up. All three now use `computeWalletBalance()` from `lib/wallet/balance.ts`.

---

## 4. Data model (migrations 015 + 016)

Run **015 first, then 016** — Postgres can't use a new enum value in the transaction that adds it.

| Table | Purpose |
|-------|---------|
| `ai_action_prices` | admin-configurable per-action credit prices |
| `ai_quick_list_drafts` | drafts; `suggested` (AI) and `edits` (human) kept separate |
| `ai_listing_sources` | every lookup that fed a draft, raw payload included |
| `ai_image_jobs` | generation jobs with prompt, provider job ID, status |
| `lot_images` | source of truth for imagery, split by `kind` |
| `ai_credit_ledger` | the AI spend audit trail |
| `ai_moderation_events` | moderation and prohibited-item outcomes |
| `ai_prohibited_terms` | admin-editable policy screening list |
| `ai_rate_limit_events` | durable rate limiting (in-memory limiters reset on cold start) |

Storage buckets: `lot-images` (originals, already existed — now reproducible) and `ai-generated`
(generated, read-only to the public, service-role writes only).

RLS: drafts and jobs are scoped to the owning auctioneer; `lot_images` is publicly readable only
for lots in a visible auction; ledger rows are readable by their own user; writes to `lot_images`
go through service-role API routes.

---

## 5. Safety

- **Prohibited items** — `ai_prohibited_terms`, whole-phrase matched. `block` stops the action with
  no charge; `flag` proceeds but records the event and warns in the review screen.
- **Content moderation** — OpenAI `omni-moderation-latest` on identification output, draft copy and
  any lifestyle scene hint. If moderation is unavailable the draft is *flagged*, not silently passed.
- **Rate limits** — per user, per action, per hour, from `ai_action_prices.rate_limit_per_hour`,
  counted in the database so serverless cold starts don't reset them.
- **Feature flag** — `ai_quick_listing` in `feature_flags` disables the whole feature without a deploy.

---

## 6. Providers

| Purpose | Provider | Key | Missing key behaviour |
|---------|----------|-----|----------------------|
| ISBN lookup | Open Library | none | — |
| UPC/EAN lookup | UPCitemdb (trial tier) | none | — |
| UPC/EAN lookup (extra) | Barcode Lookup | `BARCODE_LOOKUP_API_KEY` | skipped |
| Vision, drafting, moderation | OpenAI (`gpt-4o-mini` default) | `OPENAI_API_KEY` | identification/draft return 503 |
| Presentation images | Replicate (`flux-kontext-dev` default) | `REPLICATE_API_TOKEN` | image buttons disabled, clearly stated in the UI |

Models are read from `ai_action_prices.model`, so they're swappable from the admin console without
a deploy. Defaults are deliberately the cheap tier.

Barcode *scanning* uses the browser-native `BarcodeDetector` API — no library to download on a
phone. Where it's unavailable the UI falls back to manual entry and says so.

---

## 7. API

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/ai/quick-list/pricing` | live prices + spendable balance |
| POST | `/api/ai/quick-list/identify` | scan/photos → candidates + draft |
| GET | `/api/ai/quick-list/drafts` | batch queue |
| POST | `/api/ai/quick-list/drafts/[id]/generate` | candidate → full draft |
| GET/PATCH/DELETE | `/api/ai/quick-list/drafts/[id]` | read / edit / discard |
| POST | `/api/ai/quick-list/drafts/[id]/approve` | publish to a lot |
| POST | `/api/ai/images/generate` | buy a presentation image |
| GET | `/api/ai/images/jobs/[id]` | poll a job |
| GET/PATCH | `/api/admin/ai/pricing` | admin price config |
| GET/POST | `/api/admin/ai/ledger` | audit trail + manual refund |

---

## 8. Tests

```bash
npm run test:unit    # 57 pure-logic tests, no server needed
npm run test:e2e     # browser specs (starts the dev server)
```

Unit tests (`tests/unit/`) cover barcode checksums and classification, candidate merging and the
selection-gating rules, image-prompt integrity (every rule present in every variant, scene hints
can't override them), prohibited-term matching, draft guardrails (estimate inversion, starting-bid
sanity, confidence capping) and the wallet sign table including AI spend/refund.

E2E (`tests/quick-list-flow.spec.ts`) covers access control, cost-before-generation, mis-scan
warnings, mobile layout, the bidder-facing originals-first gallery with its disclosure, and the
admin console. Credential-dependent cases skip cleanly when the env vars aren't set.

---

## 9. Deploying

1. Run `015_ai_quick_listing_enums.sql`, then `016_ai_quick_listing.sql`.
2. Set `REPLICATE_API_TOKEN` if presentation images should be available (everything else works
   without it).
3. Confirm prices at `/admin/ai`.

Note for this project specifically: the repo-root `supabase/` tree is a stale second chain —
`apps/web/supabase/migrations` is canonical.
