-- 016_ai_quick_listing.sql
-- AI Quick Listing & Product Presentation.
--
-- Extends the existing catalog + ITC wallet architecture. Nothing here replaces
-- an existing table: `lots.images` stays exactly as-is (verified originals) and
-- every AI artifact lives in its own auditable table.
--
-- Requires 015_ai_quick_listing_enums.sql (adds 'ai_spend' / 'ai_refund' to
-- the transaction_type enum) to have been applied first.

-- ============================================================
-- 1. Admin-configurable AI action prices
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_action_prices (
  action_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'listing'
    CHECK (category IN ('listing', 'image')),
  credit_cost INTEGER NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  provider TEXT,
  model TEXT,
  rate_limit_per_hour INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_per_hour > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_action_prices IS
  'Per-action ITC credit prices for AI features. Admin-configurable; the API always reads the live row, never a hardcoded constant.';

INSERT INTO public.ai_action_prices
  (action_key, label, description, category, credit_cost, provider, model, rate_limit_per_hour, sort_order)
VALUES
  ('quick_list_identify',
   'Identify item',
   'Barcode / UPC / ISBN lookup plus photo understanding to identify the item and return candidate matches.',
   'listing', 5, 'openai', 'gpt-4o-mini', 120, 10),
  ('quick_list_draft',
   'Generate listing draft',
   'Full draft listing: title, description, category, brand/model, attributes, condition notes, suggested starting bid and duration.',
   'listing', 10, 'openai', 'gpt-4o-mini', 120, 20),
  ('quick_list_condition',
   'AI condition notes',
   'Re-run condition analysis on the verified original photos for an existing draft.',
   'listing', 5, 'openai', 'gpt-4o-mini', 120, 30),
  ('image_cleanup',
   'Clean background',
   'Remove background clutter and produce a clean product-on-white presentation image.',
   'image', 15, 'replicate', 'black-forest-labs/flux-kontext-dev', 60, 40),
  ('image_studio',
   'Professional presentation',
   'Studio-lit presentation variant of the item photo for catalog display.',
   'image', 20, 'replicate', 'black-forest-labs/flux-kontext-dev', 60, 50),
  ('image_lifestyle',
   'Lifestyle mockup',
   'Staged, in-context mockup showing the item in a realistic setting.',
   'image', 25, 'replicate', 'black-forest-labs/flux-kontext-dev', 60, 60)
ON CONFLICT (action_key) DO NOTHING;

-- ============================================================
-- 2. Quick list drafts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_quick_list_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auctioneer_id UUID NOT NULL REFERENCES public.auctioneers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  auction_id UUID REFERENCES public.auctions(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'capturing'
    CHECK (status IN ('capturing', 'identifying', 'needs_selection', 'draft_ready',
                      'approved', 'discarded', 'blocked', 'failed')),
  capture_mode TEXT NOT NULL DEFAULT 'photo'
    CHECK (capture_mode IN ('barcode', 'photo', 'manual', 'hybrid')),

  -- Scan input
  scan_value TEXT,
  scan_format TEXT
    CHECK (scan_format IS NULL OR scan_format IN
      ('upc_a', 'upc_e', 'ean_13', 'ean_8', 'isbn_10', 'isbn_13', 'sku', 'other')),
  manual_context TEXT,

  -- Candidate matches presented to the auctioneer when identification is uncertain
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_candidate_index INTEGER,

  -- AI suggestion payload, and the auctioneer's edits kept separately for audit
  suggested JSONB NOT NULL DEFAULT '{}'::jsonb,
  edits JSONB NOT NULL DEFAULT '{}'::jsonb,

  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  confidence_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,

  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'passed', 'flagged', 'blocked')),
  moderation_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  suggested_starting_bid INTEGER CHECK (suggested_starting_bid IS NULL OR suggested_starting_bid >= 0),
  suggested_duration_hours INTEGER CHECK (suggested_duration_hours IS NULL OR suggested_duration_hours > 0),

  lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_quick_list_drafts IS
  'Draft listings produced by the Quick List scanner. A draft NEVER becomes a public lot without an explicit auctioneer approval (see status=approved + lot_id).';

CREATE INDEX IF NOT EXISTS idx_ai_drafts_auctioneer ON public.ai_quick_list_drafts(auctioneer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_status ON public.ai_quick_list_drafts(auctioneer_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_auction ON public.ai_quick_list_drafts(auction_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_lot ON public.ai_quick_list_drafts(lot_id);

-- ============================================================
-- 3. Identification source / match metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_listing_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.ai_quick_list_drafts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('barcode', 'isbn', 'vision', 'ocr', 'catalog', 'manual')),
  provider TEXT NOT NULL,
  query TEXT,
  matched BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms INTEGER,
  error TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_listing_sources IS
  'Every external/AI lookup that contributed to a draft, stored raw for auditability.';

CREATE INDEX IF NOT EXISTS idx_ai_sources_draft ON public.ai_listing_sources(draft_id, fetched_at DESC);

-- ============================================================
-- 4. AI image generation jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auctioneer_id UUID NOT NULL REFERENCES public.auctioneers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.ai_quick_list_drafts(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,

  action_key TEXT NOT NULL REFERENCES public.ai_action_prices(action_key),
  variant TEXT NOT NULL CHECK (variant IN ('cleanup', 'studio', 'lifestyle')),

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked')),

  source_image_url TEXT NOT NULL,
  source_image_id UUID,

  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  provider_job_id TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'passed', 'flagged', 'blocked')),
  moderation_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  result_image_id UUID,
  idempotency_key TEXT NOT NULL,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT ai_image_jobs_target CHECK (draft_id IS NOT NULL OR lot_id IS NOT NULL),
  CONSTRAINT ai_image_jobs_idem UNIQUE (created_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_draft ON public.ai_image_jobs(draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_lot ON public.ai_image_jobs(lot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_image_jobs_status ON public.ai_image_jobs(status, created_at DESC);

-- ============================================================
-- 5. Lot images — verified originals vs AI-generated, kept apart
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lot_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.ai_quick_list_drafts(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN ('original', 'ai_generated')),
  bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,

  position INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,

  -- Integrity: captured at upload so any later alteration is detectable
  checksum_sha256 TEXT,
  byte_size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,

  -- AI-generated only
  variant TEXT CHECK (variant IS NULL OR variant IN ('cleanup', 'studio', 'lifestyle')),
  source_image_id UUID REFERENCES public.lot_images(id) ON DELETE SET NULL,
  prompt TEXT,
  negative_prompt TEXT,
  provider TEXT,
  model TEXT,
  provider_job_id TEXT,
  image_job_id UUID REFERENCES public.ai_image_jobs(id) ON DELETE SET NULL,
  generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  disclosure_label TEXT,

  moderation_status TEXT NOT NULL DEFAULT 'passed'
    CHECK (moderation_status IN ('pending', 'passed', 'flagged', 'blocked')),
  moderation_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  credit_ledger_id UUID,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lot_images_target CHECK (lot_id IS NOT NULL OR draft_id IS NOT NULL),
  -- Originals carry no generation provenance, ever.
  CONSTRAINT lot_images_original_is_clean CHECK (
    kind <> 'original'
    OR (prompt IS NULL AND provider IS NULL AND variant IS NULL
        AND image_job_id IS NULL AND source_image_id IS NULL)
  ),
  -- Generated images must always declare what they are and where they came from.
  CONSTRAINT lot_images_generated_is_labelled CHECK (
    kind <> 'ai_generated'
    OR (variant IS NOT NULL AND provider IS NOT NULL AND disclosure_label IS NOT NULL)
  )
);

COMMENT ON TABLE public.lot_images IS
  'Source of truth for lot imagery. kind=original are the verified, unaltered buyer-facing photos; kind=ai_generated are presentation-only mockups and may never be the primary evidence for a lot.';

CREATE INDEX IF NOT EXISTS idx_lot_images_lot ON public.lot_images(lot_id, kind, position);
CREATE INDEX IF NOT EXISTS idx_lot_images_draft ON public.lot_images(draft_id, kind, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_images_unique_path ON public.lot_images(bucket, storage_path);

-- An AI-generated image can never be flagged as the lot's primary image.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_images_single_primary
  ON public.lot_images(lot_id)
  WHERE is_primary AND lot_id IS NOT NULL;

-- ------------------------------------------------------------
-- Integrity guards
-- ------------------------------------------------------------

-- Verified originals are append-only in every field that describes the file.
-- Rewriting the URL, path or checksum of an original is how a "cleaned up"
-- image would silently become the buyer's evidence. Block it at the database.
CREATE OR REPLACE FUNCTION public.lot_images_protect_originals()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.kind = 'original' THEN
    IF NEW.kind <> 'original' THEN
      RAISE EXCEPTION 'A verified original image cannot be reclassified';
    END IF;
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.bucket IS DISTINCT FROM OLD.bucket
       OR NEW.public_url IS DISTINCT FROM OLD.public_url
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.byte_size IS DISTINCT FROM OLD.byte_size THEN
      RAISE EXCEPTION 'Verified original photos are immutable (lot_images.id=%)', OLD.id;
    END IF;
  END IF;

  IF NEW.kind = 'ai_generated' AND NEW.is_primary THEN
    RAISE EXCEPTION 'AI-generated presentation images cannot be the primary lot image';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lot_images_protect_originals ON public.lot_images;
CREATE TRIGGER trg_lot_images_protect_originals
  BEFORE UPDATE ON public.lot_images
  FOR EACH ROW EXECUTE FUNCTION public.lot_images_protect_originals();

CREATE OR REPLACE FUNCTION public.lot_images_guard_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind = 'ai_generated' AND NEW.is_primary THEN
    RAISE EXCEPTION 'AI-generated presentation images cannot be the primary lot image';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lot_images_guard_insert ON public.lot_images;
CREATE TRIGGER trg_lot_images_guard_insert
  BEFORE INSERT ON public.lot_images
  FOR EACH ROW EXECUTE FUNCTION public.lot_images_guard_insert();

ALTER TABLE public.ai_image_jobs
  DROP CONSTRAINT IF EXISTS ai_image_jobs_result_image_fk;
ALTER TABLE public.ai_image_jobs
  ADD CONSTRAINT ai_image_jobs_result_image_fk
  FOREIGN KEY (result_image_id) REFERENCES public.lot_images(id) ON DELETE SET NULL;

-- ============================================================
-- 6. AI credit ledger (one row per billable AI action)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  auctioneer_id UUID REFERENCES public.auctioneers(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL REFERENCES public.ai_action_prices(action_key),
  credit_cost INTEGER NOT NULL CHECK (credit_cost >= 0),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'charged', 'refunded', 'voided', 'failed')),

  idempotency_key TEXT NOT NULL,

  draft_id UUID REFERENCES public.ai_quick_list_drafts(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  image_job_id UUID REFERENCES public.ai_image_jobs(id) ON DELETE SET NULL,

  provider TEXT,
  provider_job_id TEXT,

  wallet_ledger_id UUID REFERENCES public.wallet_ledger(id) ON DELETE SET NULL,
  refund_wallet_ledger_id UUID REFERENCES public.wallet_ledger(id) ON DELETE SET NULL,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  failure_reason TEXT,

  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  charged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_credit_ledger_idem UNIQUE (user_id, idempotency_key)
);

COMMENT ON TABLE public.ai_credit_ledger IS
  'Full audit trail for every AI action: who, what action, cost, target listing/item, provider job id, status and refund details. A pending row reserves credits; wallet_ledger is only touched on success.';

CREATE INDEX IF NOT EXISTS idx_ai_ledger_user ON public.ai_credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ledger_status ON public.ai_credit_ledger(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ledger_action ON public.ai_credit_ledger(action_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ledger_draft ON public.ai_credit_ledger(draft_id);
CREATE INDEX IF NOT EXISTS idx_ai_ledger_pending ON public.ai_credit_ledger(user_id) WHERE status = 'pending';

ALTER TABLE public.lot_images
  DROP CONSTRAINT IF EXISTS lot_images_credit_ledger_fk;
ALTER TABLE public.lot_images
  ADD CONSTRAINT lot_images_credit_ledger_fk
  FOREIGN KEY (credit_ledger_id) REFERENCES public.ai_credit_ledger(id) ON DELETE SET NULL;

-- ============================================================
-- 7. Moderation + prohibited items + rate limiting
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('draft', 'image_job', 'text')),
  subject_id UUID,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'flagged', 'blocked')),
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_moderation_subject ON public.ai_moderation_events(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_ai_moderation_status ON public.ai_moderation_events(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_prohibited_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'block' CHECK (severity IN ('block', 'flag')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_prohibited_terms_unique UNIQUE (term)
);

INSERT INTO public.ai_prohibited_terms (term, category, severity, notes) VALUES
  ('firearm', 'weapons', 'block', 'Regulated: firearms may not be listed via Quick List'),
  ('handgun', 'weapons', 'block', NULL),
  ('rifle', 'weapons', 'flag', 'Flag for review — may be a replica, airsoft or collectible'),
  ('ammunition', 'weapons', 'block', NULL),
  ('silencer', 'weapons', 'block', NULL),
  ('explosive', 'weapons', 'block', NULL),
  ('ivory', 'wildlife', 'block', 'Endangered species products'),
  ('rhino horn', 'wildlife', 'block', NULL),
  ('endangered species', 'wildlife', 'block', NULL),
  ('prescription drug', 'regulated', 'block', NULL),
  ('controlled substance', 'regulated', 'block', NULL),
  ('human remains', 'prohibited', 'block', NULL),
  ('counterfeit', 'ip', 'block', 'Replica/counterfeit branded goods'),
  ('replica designer', 'ip', 'flag', NULL),
  ('stolen', 'prohibited', 'block', NULL),
  ('government id', 'prohibited', 'block', NULL),
  ('passport', 'prohibited', 'flag', NULL),
  ('lottery ticket', 'regulated', 'flag', NULL),
  ('tobacco', 'regulated', 'flag', NULL),
  ('vape', 'regulated', 'flag', NULL),
  ('alcohol', 'regulated', 'flag', 'Licensed sellers only in most jurisdictions')
ON CONFLICT (term) DO NOTHING;

-- Durable rate limiting. The existing in-memory limiters in /api/ai/* reset on
-- every serverless cold start, so AI spend needs a database-backed counter.
CREATE TABLE IF NOT EXISTS public.ai_rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limit_lookup
  ON public.ai_rate_limit_events(user_id, action_key, created_at DESC);

-- ============================================================
-- 8. Credit functions (atomic charge / settle / refund)
-- ============================================================

-- Credits that are actually spendable right now: wallet balance minus any
-- in-flight AI reservations. Keeps concurrent Quick List taps from overdrawing
-- while still honouring "deduct only after a successful result".
CREATE OR REPLACE FUNCTION public.ai_available_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_balance INTEGER;
  v_pending INTEGER;
BEGIN
  v_balance := public.get_wallet_balance(p_user_id);

  SELECT COALESCE(SUM(credit_cost), 0)
  INTO v_pending
  FROM public.ai_credit_ledger
  WHERE user_id = p_user_id
    AND status = 'pending'
    AND created_at > NOW() - INTERVAL '30 minutes';

  RETURN GREATEST(v_balance - v_pending, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.ai_check_rate_limit(
  p_user_id UUID,
  p_action_key TEXT,
  p_max_per_hour INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_used INTEGER;
BEGIN
  DELETE FROM public.ai_rate_limit_events
  WHERE created_at < NOW() - INTERVAL '2 hours';

  SELECT COUNT(*)
  INTO v_used
  FROM public.ai_rate_limit_events
  WHERE user_id = p_user_id
    AND action_key = p_action_key
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_used >= p_max_per_hour THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_max_per_hour);
  END IF;

  INSERT INTO public.ai_rate_limit_events (user_id, action_key)
  VALUES (p_user_id, p_action_key);

  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', p_max_per_hour);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reserve credits for an AI action. Nothing is deducted from the wallet here —
-- this only creates the pending ledger row that makes the spend auditable and
-- prevents concurrent overdraft. Idempotent on (user_id, idempotency_key).
CREATE OR REPLACE FUNCTION public.ai_begin_action(
  p_user_id UUID,
  p_action_key TEXT,
  p_idempotency_key TEXT,
  p_auctioneer_id UUID DEFAULT NULL,
  p_draft_id UUID DEFAULT NULL,
  p_lot_id UUID DEFAULT NULL,
  p_image_job_id UUID DEFAULT NULL,
  p_request_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_price RECORD;
  v_existing RECORD;
  v_available INTEGER;
  v_ledger_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_existing
  FROM public.ai_credit_ledger
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'ledger_id', v_existing.id,
      'status', v_existing.status,
      'credit_cost', v_existing.credit_cost
    );
  END IF;

  SELECT * INTO v_price
  FROM public.ai_action_prices
  WHERE action_key = p_action_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_action', 'action_key', p_action_key);
  END IF;

  IF NOT v_price.is_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'action_disabled', 'action_key', p_action_key);
  END IF;

  v_available := public.ai_available_credits(p_user_id);

  IF v_available < v_price.credit_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'credit_cost', v_price.credit_cost,
      'available', v_available
    );
  END IF;

  INSERT INTO public.ai_credit_ledger (
    user_id, auctioneer_id, action_key, credit_cost, status, idempotency_key,
    draft_id, lot_id, image_job_id, provider, request_metadata
  ) VALUES (
    p_user_id, p_auctioneer_id, p_action_key, v_price.credit_cost, 'pending', p_idempotency_key,
    p_draft_id, p_lot_id, p_image_job_id, v_price.provider, COALESCE(p_request_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'ledger_id', v_ledger_id,
    'status', 'pending',
    'credit_cost', v_price.credit_cost,
    'available', v_available - v_price.credit_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Success path: this is the ONLY place ITC leaves the wallet for an AI action.
CREATE OR REPLACE FUNCTION public.ai_settle_action(
  p_ledger_id UUID,
  p_provider TEXT DEFAULT NULL,
  p_provider_job_id TEXT DEFAULT NULL,
  p_result_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_ledger RECORD;
  v_label TEXT;
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_wallet_id UUID;
BEGIN
  SELECT * INTO v_ledger FROM public.ai_credit_ledger WHERE id = p_ledger_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_ledger_entry');
  END IF;

  IF v_ledger.status = 'charged' THEN
    RETURN jsonb_build_object('ok', true, 'already_charged', true, 'ledger_id', p_ledger_id);
  END IF;

  IF v_ledger.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_ledger.status);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_ledger.user_id::text, 0));

  SELECT label INTO v_label FROM public.ai_action_prices WHERE action_key = v_ledger.action_key;

  IF v_ledger.credit_cost = 0 THEN
    UPDATE public.ai_credit_ledger
    SET status = 'charged',
        charged_at = NOW(),
        updated_at = NOW(),
        provider = COALESCE(p_provider, provider),
        provider_job_id = COALESCE(p_provider_job_id, provider_job_id),
        result_metadata = COALESCE(p_result_metadata, '{}'::jsonb)
    WHERE id = p_ledger_id;

    RETURN jsonb_build_object('ok', true, 'ledger_id', p_ledger_id, 'charged', 0);
  END IF;

  v_balance := public.get_wallet_balance(v_ledger.user_id);

  IF v_balance < v_ledger.credit_cost THEN
    UPDATE public.ai_credit_ledger
    SET status = 'voided',
        failure_reason = 'insufficient_credits_at_settlement',
        updated_at = NOW()
    WHERE id = p_ledger_id;

    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'available', v_balance);
  END IF;

  v_new_balance := v_balance - v_ledger.credit_cost;

  INSERT INTO public.wallet_ledger (
    user_id, transaction_type, amount, balance_after, description,
    reference_id, reference_type, metadata
  ) VALUES (
    v_ledger.user_id,
    'ai_spend',
    v_ledger.credit_cost,
    v_new_balance,
    COALESCE(v_label, v_ledger.action_key) || ' (AI)',
    p_ledger_id,
    'ai_credit_ledger',
    jsonb_build_object(
      'action_key', v_ledger.action_key,
      'draft_id', v_ledger.draft_id,
      'lot_id', v_ledger.lot_id,
      'provider_job_id', COALESCE(p_provider_job_id, v_ledger.provider_job_id)
    )
  )
  RETURNING id INTO v_wallet_id;

  UPDATE public.ai_credit_ledger
  SET status = 'charged',
      charged_at = NOW(),
      updated_at = NOW(),
      wallet_ledger_id = v_wallet_id,
      provider = COALESCE(p_provider, provider),
      provider_job_id = COALESCE(p_provider_job_id, provider_job_id),
      result_metadata = COALESCE(p_result_metadata, '{}'::jsonb)
  WHERE id = p_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ledger_id', p_ledger_id,
    'charged', v_ledger.credit_cost,
    'balance_after', v_new_balance,
    'wallet_ledger_id', v_wallet_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Failure path: release the reservation without ever touching the wallet.
CREATE OR REPLACE FUNCTION public.ai_void_action(
  p_ledger_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ledger RECORD;
BEGIN
  SELECT * INTO v_ledger FROM public.ai_credit_ledger WHERE id = p_ledger_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_ledger_entry');
  END IF;

  IF v_ledger.status = 'charged' THEN
    RETURN public.ai_refund_action(p_ledger_id, COALESCE(p_reason, 'action_failed_after_charge'));
  END IF;

  IF v_ledger.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'ledger_id', p_ledger_id, 'status', v_ledger.status);
  END IF;

  UPDATE public.ai_credit_ledger
  SET status = 'voided',
      failure_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_ledger_id;

  RETURN jsonb_build_object('ok', true, 'ledger_id', p_ledger_id, 'status', 'voided', 'charged', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.ai_refund_action(
  p_ledger_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ledger RECORD;
  v_label TEXT;
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_wallet_id UUID;
BEGIN
  SELECT * INTO v_ledger FROM public.ai_credit_ledger WHERE id = p_ledger_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_ledger_entry');
  END IF;

  IF v_ledger.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'already_refunded', true, 'ledger_id', p_ledger_id);
  END IF;

  IF v_ledger.status <> 'charged' THEN
    RETURN public.ai_void_action(p_ledger_id, COALESCE(p_reason, 'refund_requested_before_charge'));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_ledger.user_id::text, 0));

  SELECT label INTO v_label FROM public.ai_action_prices WHERE action_key = v_ledger.action_key;

  v_balance := public.get_wallet_balance(v_ledger.user_id);
  v_new_balance := v_balance + v_ledger.credit_cost;

  INSERT INTO public.wallet_ledger (
    user_id, transaction_type, amount, balance_after, description,
    reference_id, reference_type, metadata
  ) VALUES (
    v_ledger.user_id,
    'ai_refund',
    v_ledger.credit_cost,
    v_new_balance,
    'Refund: ' || COALESCE(v_label, v_ledger.action_key),
    p_ledger_id,
    'ai_credit_ledger',
    jsonb_build_object('action_key', v_ledger.action_key, 'reason', p_reason)
  )
  RETURNING id INTO v_wallet_id;

  UPDATE public.ai_credit_ledger
  SET status = 'refunded',
      refunded_at = NOW(),
      refund_reason = p_reason,
      refund_wallet_ledger_id = v_wallet_id,
      updated_at = NOW()
  WHERE id = p_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ledger_id', p_ledger_id,
    'refunded', v_ledger.credit_cost,
    'balance_after', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.ai_available_credits(UUID) TO authenticated;

-- ============================================================
-- 9. updated_at triggers
-- ============================================================

DROP TRIGGER IF EXISTS trg_ai_action_prices_updated ON public.ai_action_prices;
CREATE TRIGGER trg_ai_action_prices_updated
  BEFORE UPDATE ON public.ai_action_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ai_drafts_updated ON public.ai_quick_list_drafts;
CREATE TRIGGER trg_ai_drafts_updated
  BEFORE UPDATE ON public.ai_quick_list_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ai_image_jobs_updated ON public.ai_image_jobs;
CREATE TRIGGER trg_ai_image_jobs_updated
  BEFORE UPDATE ON public.ai_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ai_credit_ledger_updated ON public.ai_credit_ledger;
CREATE TRIGGER trg_ai_credit_ledger_updated
  BEFORE UPDATE ON public.ai_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 10. Row level security
-- ============================================================

ALTER TABLE public.ai_action_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quick_list_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_listing_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_image_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prohibited_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Prices: anyone signed in may read (the UI must show cost before generating);
-- only admins may change them.
DROP POLICY IF EXISTS "Authenticated read ai prices" ON public.ai_action_prices;
CREATE POLICY "Authenticated read ai prices" ON public.ai_action_prices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage ai prices" ON public.ai_action_prices;
CREATE POLICY "Admins manage ai prices" ON public.ai_action_prices
  FOR ALL TO authenticated
  USING (get_user_role() = 'admin'::user_role)
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- Drafts: owned by the auctioneer that created them. Never public.
DROP POLICY IF EXISTS "Auctioneers manage own drafts" ON public.ai_quick_list_drafts;
CREATE POLICY "Auctioneers manage own drafts" ON public.ai_quick_list_drafts
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR auctioneer_id IN (SELECT id FROM public.auctioneers WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'::user_role
  )
  WITH CHECK (
    created_by = auth.uid()
    OR auctioneer_id IN (SELECT id FROM public.auctioneers WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'::user_role
  );

DROP POLICY IF EXISTS "Draft owners read sources" ON public.ai_listing_sources;
CREATE POLICY "Draft owners read sources" ON public.ai_listing_sources
  FOR SELECT TO authenticated
  USING (
    draft_id IN (
      SELECT id FROM public.ai_quick_list_drafts
      WHERE created_by = auth.uid()
         OR auctioneer_id IN (SELECT id FROM public.auctioneers WHERE user_id = auth.uid())
    )
    OR get_user_role() = 'admin'::user_role
  );

DROP POLICY IF EXISTS "Auctioneers read own image jobs" ON public.ai_image_jobs;
CREATE POLICY "Auctioneers read own image jobs" ON public.ai_image_jobs
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR auctioneer_id IN (SELECT id FROM public.auctioneers WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'::user_role
  );

-- Lot images: bidders must be able to see imagery for lots in a visible
-- auction. Draft-stage images stay private to the auctioneer.
DROP POLICY IF EXISTS "Public read published lot images" ON public.lot_images;
CREATE POLICY "Public read published lot images" ON public.lot_images
  FOR SELECT
  USING (
    lot_id IN (
      SELECT l.id FROM public.lots l
      JOIN public.auctions a ON a.id = l.auction_id
      WHERE a.status IN ('scheduled', 'live', 'ended', 'completed')
    )
  );

DROP POLICY IF EXISTS "Auctioneers read own lot images" ON public.lot_images;
CREATE POLICY "Auctioneers read own lot images" ON public.lot_images
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR draft_id IN (
      SELECT id FROM public.ai_quick_list_drafts
      WHERE auctioneer_id IN (SELECT id FROM public.auctioneers WHERE user_id = auth.uid())
    )
    OR lot_id IN (
      SELECT l.id FROM public.lots l
      JOIN public.auctions a ON a.id = l.auction_id
      JOIN public.auctioneers ac ON ac.id = a.auctioneer_id
      WHERE ac.user_id = auth.uid()
    )
    OR get_user_role() = 'admin'::user_role
  );

-- Writes to lot_images go through the service-role API routes only. Admins keep
-- a manual escape hatch; ordinary users get no INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS "Admins manage lot images" ON public.lot_images;
CREATE POLICY "Admins manage lot images" ON public.lot_images
  FOR ALL TO authenticated
  USING (get_user_role() = 'admin'::user_role)
  WITH CHECK (get_user_role() = 'admin'::user_role);

DROP POLICY IF EXISTS "Users read own ai ledger" ON public.ai_credit_ledger;
CREATE POLICY "Users read own ai ledger" ON public.ai_credit_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin'::user_role);

DROP POLICY IF EXISTS "Admins read moderation events" ON public.ai_moderation_events;
CREATE POLICY "Admins read moderation events" ON public.ai_moderation_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin'::user_role);

DROP POLICY IF EXISTS "Authenticated read prohibited terms" ON public.ai_prohibited_terms;
CREATE POLICY "Authenticated read prohibited terms" ON public.ai_prohibited_terms
  FOR SELECT TO authenticated USING (is_active);

DROP POLICY IF EXISTS "Admins manage prohibited terms" ON public.ai_prohibited_terms;
CREATE POLICY "Admins manage prohibited terms" ON public.ai_prohibited_terms
  FOR ALL TO authenticated
  USING (get_user_role() = 'admin'::user_role)
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- ai_rate_limit_events: RLS on with no policies = deny-all for ordinary users.
-- Only ai_check_rate_limit (SECURITY DEFINER) and the service role touch it.

-- ============================================================
-- 11. Storage buckets
-- ============================================================

-- lot-images already exists in production (created by hand for the lot form);
-- this makes it reproducible for fresh environments without changing prod.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lot-images', 'lot-images', true, 15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Generated presentation images live in their own bucket so they can never be
-- confused with the verified originals at the storage layer either.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-generated', 'ai-generated', true, 15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Read-only for everyone; writes are service-role only (API routes upload the
-- provider output server-side after moderation).
--
-- storage.objects is owned by supabase_storage_admin, so policy creation can be
-- refused depending on the role running the migration. The bucket is public
-- either way, so a refusal is logged rather than failing the whole migration.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public read ai generated images" ON storage.objects;
  CREATE POLICY "Public read ai generated images" ON storage.objects
    FOR SELECT USING (bucket_id = 'ai-generated');
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Skipped storage.objects policy for ai-generated (insufficient privilege). The bucket is public; create the policy from the Supabase dashboard if needed.';
END $$;

-- ============================================================
-- 12. Feature flag
-- ============================================================

INSERT INTO public.feature_flags (flag_name, is_enabled, description)
VALUES ('ai_quick_listing', true, 'AI Quick Listing & Product Presentation for auctioneers')
ON CONFLICT (flag_name) DO NOTHING;
