-- 021: card-on-file bidding, invoices charged under the auctioneer's processor
--
-- Business model (locked): one NMI gateway, one merchant account (MID) per
-- auctioneer. A bidder keeps one verified card in the gateway Customer Vault
-- (020). When an auction closes, each winner's card is charged hammer plus the
-- auctioneer's buyer's premium under `auctioneers.gateway_processor_id`, so the
-- money settles to that auctioneer. The auctioneer keeps the premium; ITA's
-- commission (platform_settings.commission_rate, 1.2% of hammer) is billed to
-- the auctioneer separately (Task 5). No wallet, no ITC, no escrow.
--
-- What this file does
--   1. auctioneers: gateway_processor_id, payments_enabled, merchant_status,
--      commission_rate_override. All four are privileged (service role / admin
--      only), so they get no authenticated UPDATE grant and join the 019
--      column-protection trigger when it is present.
--   2. invoices: payment_status state machine + gateway fields. `is_paid` stays
--      (ship / delivery code reads it) and is kept in sync by a trigger.
--   3. platform_settings (key/value JSONB), seeded with the commission rates.
--   4. place_bid: ONE final overload. Every earlier signature is dropped first
--      (the live database has two). No wallet reads or writes; a verified card
--      on file is required; the first bid on a lot is accepted at exactly
--      starting_bid, later bids need current_high_bid + increment; proxy
--      (max_bids) counters, outbid notifications and anti-sniping are kept.
--   5. process_auction_end: creates unpaid invoices (premium and commission
--      rounded exactly like lib/pricing/premium.ts), returns the invoice ids
--      for the close route to charge. No wallet writes. Idempotent per lot.
--   6. release_escrow_on_shipping is dropped (escrow no longer exists).
--   7. auctions cannot transition to 'live' unless the auctioneer has
--      payments_enabled = true.
--
-- Money is integer cents everywhere. ROUND(hammer * pct / 100) here must keep
-- matching percentOfCents() in lib/pricing/premium.ts.
--
-- Idempotent: safe to re-run. Run after 020.

-- ============================================================
-- 1. auctioneers: merchant account routing
-- ============================================================
ALTER TABLE public.auctioneers
  ADD COLUMN IF NOT EXISTS gateway_processor_id TEXT,
  ADD COLUMN IF NOT EXISTS payments_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS commission_rate_override NUMERIC(5,2) NULL;

COMMENT ON COLUMN public.auctioneers.gateway_processor_id IS
  'NMI processor_id of this auctioneer''s merchant account under the shared gateway. Routes each winner''s charge to their MID. Set by an admin once PaymentCloud approves the account (Task 6).';
COMMENT ON COLUMN public.auctioneers.payments_enabled IS
  'True once the merchant account can accept charges. Auctions cannot go live while false.';
COMMENT ON COLUMN public.auctioneers.merchant_status IS
  'Merchant application state. ''none'' until Task 6 adds the application flow and its values.';
COMMENT ON COLUMN public.auctioneers.commission_rate_override IS
  'Per-auctioneer platform commission percent of hammer. NULL = platform_settings.commission_rate.';

-- 019 revoked table-level UPDATE from authenticated and re-granted columns one
-- by one, so these new columns start locked for users. Add them to the 019
-- protection trigger too when that function exists on this database.
DO $$
BEGIN
  IF to_regproc('public.protect_privileged_columns') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS protect_auctioneers_privileged_columns ON public.auctioneers;
    CREATE TRIGGER protect_auctioneers_privileged_columns
      BEFORE UPDATE ON public.auctioneers
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_privileged_columns(
        'is_approved', 'approval_date',
        'gateway_processor_id', 'payments_enabled', 'merchant_status', 'commission_rate_override'
      );
  ELSE
    RAISE NOTICE 'protect_privileged_columns() not found (019 not applied); skipping trigger extension';
  END IF;
END $$;

-- ============================================================
-- 2. invoices: payment state machine
-- ============================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_cents INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_payment_status_check' AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_payment_status_check CHECK (
        payment_status IN ('unpaid', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_refunded_cents_check' AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_refunded_cents_check CHECK (refunded_cents >= 0 AND refunded_cents <= total_amount);
  END IF;
END $$;

COMMENT ON COLUMN public.invoices.payment_status IS
  'unpaid -> processing -> paid | failed (retry -> processing). paid -> partially_refunded -> refunded; paid -> disputed on chargeback. Written by lib/payments/invoice-charge.ts and the NMI webhook handlers.';
COMMENT ON COLUMN public.invoices.gateway_transaction_id IS 'NMI transactionid of the approved sale.';
COMMENT ON COLUMN public.invoices.failure_reason IS 'Gateway responsetext (or our own reason) of the last failed charge.';
COMMENT ON COLUMN public.invoices.attempts IS 'Charge attempts so far. The retry cron stops at 3.';
COMMENT ON COLUMN public.invoices.refunded_cents IS 'Total refunded so far, in cents. refunded when it reaches total_amount.';

-- Rows paid before this migration (wallet era) keep reading as paid.
UPDATE public.invoices SET payment_status = 'paid' WHERE is_paid = true AND payment_status = 'unpaid';

-- Keep is_paid in step with payment_status (ship / delivery / dashboards read
-- is_paid). A legacy writer that flips is_paid directly is mirrored back into
-- payment_status so the two can never disagree.
CREATE OR REPLACE FUNCTION public.invoices_sync_payment_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_paid AND NEW.payment_status = 'unpaid')
     OR (TG_OP = 'UPDATE' AND NEW.is_paid IS DISTINCT FROM OLD.is_paid AND NEW.payment_status = OLD.payment_status) THEN
    IF NEW.is_paid THEN
      NEW.payment_status := 'paid';
    ELSIF NEW.payment_status = 'paid' THEN
      NEW.payment_status := 'unpaid';
    END IF;
  END IF;

  -- Money has been collected in these states; a full refund or void has not.
  NEW.is_paid := NEW.payment_status IN ('paid', 'partially_refunded', 'disputed');
  IF NEW.payment_status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_sync_payment_flags ON public.invoices;
CREATE TRIGGER invoices_sync_payment_flags
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_sync_payment_flags();

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_gateway_transaction_id ON public.invoices(gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL;

-- ============================================================
-- 3. platform_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_settings IS
  'Platform-wide numbers an admin may tune. commission_rate: ITA''s percent of hammer billed to auctioneers (default 1.2). standard_commission_rate: the list rate shown on marketing pages (2.0).';

INSERT INTO public.platform_settings (key, value)
VALUES
  ('commission_rate', to_jsonb(1.2::numeric)),
  ('standard_commission_rate', to_jsonb(2.0::numeric))
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS update_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS platform_settings_admin_write ON public.platform_settings;
CREATE POLICY platform_settings_admin_write ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin'::public.user_role)
  WITH CHECK (public.get_user_role() = 'admin'::public.user_role);

REVOKE ALL ON public.platform_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated; -- RLS limits writes to admins
GRANT ALL ON public.platform_settings TO service_role;

-- ============================================================
-- 4. place_bid: one overload, card on file, no wallet
-- ============================================================
-- Every signature ever defined under supabase/migrations must go, or PostgREST
-- sees an ambiguous RPC:
--   003:                          place_bid(UUID, UUID, INTEGER, bid_type, INTEGER)
--   010 / 011 / 20240101000004 /
--   20240130000001:               place_bid(UUID, UUID, INTEGER)
DROP FUNCTION IF EXISTS public.place_bid(UUID, UUID, INTEGER, public.bid_type, INTEGER);
DROP FUNCTION IF EXISTS public.place_bid(UUID, UUID, INTEGER);

-- Rules
--   * The caller bids as themselves (auth.uid() must equal p_user_id; sessions
--     without a JWT subject, i.e. the service role or the SQL editor, may bid
--     on anyone's behalf).
--   * Bidding is open when the auction is not draft/ended/completed and now()
--     is inside [starts_at, ends_at]. ends_at moves with anti-sniping.
--   * A verified card on file (bidder_payment_methods.verified_at IS NOT NULL)
--     is required; there is no balance check because nothing is charged until
--     the win.
--   * Opening bid: the FIRST bid on a lot is accepted at exactly
--     lots.starting_bid (p_amount >= starting_bid). Every later bid must be at
--     least current high bid + lots.increment. The bidding panel and the
--     max-bid route quote the same figures.
--   * Proxy: after the manual bid lands, the highest active max_bids row of
--     another bidder with a verified card whose max covers the next increment
--     counters at exactly (p_amount + increment). A proxy max that only equals
--     starting_bid is placed as the opening bid by the max-bid route, not here.
--   * Anti-sniping: a bid inside the last anti_sniping_seconds pushes ends_at
--     to now() + anti_sniping_seconds.
--   * The lot row is locked for the duration so two concurrent bids cannot
--     both pass the checks.
CREATE OR REPLACE FUNCTION public.place_bid(
  p_lot_id UUID,
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction RECORD;
  v_lot RECORD;
  v_high RECORD;
  v_has_bids BOOLEAN := false;
  v_min_bid INTEGER;
  v_previous_high_bidder UUID;
  v_previous_high_amount INTEGER;
  v_new_end_time TIMESTAMPTZ;
  v_new_bid_id UUID;
  v_final_amount INTEGER;
  v_proxy_user UUID;
  v_proxy_max INTEGER;
  v_proxy_counter INTEGER;
  v_proxy_bid_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Bid amount must be positive');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You can only bid as yourself');
  END IF;

  SELECT * INTO v_lot FROM lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lot not found');
  END IF;

  SELECT * INTO v_auction FROM auctions WHERE id = v_lot.auction_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Auction not found');
  END IF;

  IF v_auction.status IN ('draft', 'ended', 'completed') THEN
    RETURN json_build_object('success', false, 'error', 'Auction is not open for bidding');
  END IF;
  IF NOW() < v_auction.starts_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has not started yet');
  END IF;
  IF NOW() > v_auction.ends_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has ended');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM bidder_payment_methods
    WHERE user_id = p_user_id AND verified_at IS NOT NULL
  ) THEN
    RETURN json_build_object(
      'success', false,
      'code', 'no_card',
      'error', 'A verified card on file is required before you can bid. Add one under Account > Payment.'
    );
  END IF;

  SELECT amount, bidder_id INTO v_high
  FROM bids WHERE lot_id = p_lot_id
  ORDER BY amount DESC, created_at ASC
  LIMIT 1;
  v_has_bids := FOUND;

  IF v_has_bids THEN
    v_previous_high_bidder := v_high.bidder_id;
    v_previous_high_amount := v_high.amount;
    IF v_previous_high_bidder = p_user_id THEN
      RETURN json_build_object('success', false, 'error', 'You are already the high bidder');
    END IF;
    v_min_bid := v_high.amount + v_lot.increment;
  ELSE
    v_previous_high_amount := v_lot.starting_bid;
    v_min_bid := v_lot.starting_bid;
  END IF;

  IF p_amount < v_min_bid THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bid must be at least $' || to_char(v_min_bid / 100.0, 'FM999,999,990.00'),
      'minimum_bid', v_min_bid
    );
  END IF;

  -- Anti-sniping
  IF v_auction.ends_at - NOW() <= make_interval(secs => v_auction.anti_sniping_seconds) THEN
    v_new_end_time := NOW() + make_interval(secs => v_auction.anti_sniping_seconds);
    UPDATE auctions SET ends_at = v_new_end_time, updated_at = now() WHERE id = v_auction.id;
  ELSE
    v_new_end_time := v_auction.ends_at;
  END IF;

  UPDATE bids SET is_winning = false WHERE lot_id = p_lot_id AND is_winning;
  INSERT INTO bids (lot_id, bidder_id, amount, is_winning)
  VALUES (p_lot_id, p_user_id, p_amount, true)
  RETURNING id INTO v_new_bid_id;

  UPDATE lots
  SET current_high_bid = p_amount, bid_count = bid_count + 1, updated_at = now()
  WHERE id = p_lot_id;
  v_final_amount := p_amount;

  IF v_previous_high_bidder IS NOT NULL AND v_previous_high_bidder <> p_user_id THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      v_previous_high_bidder,
      'You''ve been outbid on ' || COALESCE(v_lot.title, 'a lot'),
      'Your bid of $' || to_char(v_previous_high_amount / 100.0, 'FM999,999,990.00') || ' was beaten. Tap to bid again.',
      'outbid'
    );
  END IF;

  -- Proxy auto-bid: the other bidder's max must cover the next increment and
  -- they must also have a verified card (they would be charged if they win).
  SELECT mb.user_id, mb.max_amount INTO v_proxy_user, v_proxy_max
  FROM max_bids mb
  WHERE mb.lot_id = p_lot_id
    AND mb.user_id <> p_user_id
    AND mb.is_active = true
    AND mb.max_amount >= p_amount + v_lot.increment
    AND EXISTS (
      SELECT 1 FROM bidder_payment_methods pm
      WHERE pm.user_id = mb.user_id AND pm.verified_at IS NOT NULL
    )
  ORDER BY mb.max_amount DESC, mb.updated_at ASC
  LIMIT 1;

  IF FOUND THEN
    v_proxy_counter := p_amount + v_lot.increment;

    UPDATE bids SET is_winning = false WHERE lot_id = p_lot_id AND is_winning;
    INSERT INTO bids (lot_id, bidder_id, amount, is_proxy, is_winning)
    VALUES (p_lot_id, v_proxy_user, v_proxy_counter, true, true)
    RETURNING id INTO v_proxy_bid_id;

    UPDATE lots
    SET current_high_bid = v_proxy_counter, bid_count = bid_count + 1, updated_at = now()
    WHERE id = p_lot_id;
    v_final_amount := v_proxy_counter;

    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      p_user_id,
      'Outbid by another bidder''s max',
      'Someone had a higher max bid set on ' || COALESCE(v_lot.title, 'this lot') || '. Bid again to retake the lead.',
      'outbid'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'bid_amount', p_amount,
    'previous_high', v_previous_high_amount,
    'current_high_bid', v_final_amount,
    'anti_sniping_triggered', v_new_end_time <> v_auction.ends_at,
    'ends_at', v_new_end_time,
    'proxy_counter_bid', v_proxy_bid_id IS NOT NULL
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_bid(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bid(UUID, UUID, INTEGER) TO authenticated, service_role;

-- ============================================================
-- 5. process_auction_end: invoices only, no wallet
-- ============================================================
-- Per lot: the highest bid (amount DESC, created_at ASC) wins unless it is
-- under reserve_price. The invoice is created unpaid; the close route charges
-- the returned invoice ids through lib/payments/invoice-charge.ts.
--   buyer_premium_amount       = ROUND(hammer * buyer_premium_percent / 100)
--   total_amount               = hammer + buyer_premium_amount   (what the card is charged)
--   platform_commission_amount = ROUND(hammer * rate / 100),
--     rate = COALESCE(auctioneers.commission_rate_override, platform_settings.commission_rate, 1.2)
-- Idempotent: a lot that already has an invoice is reported (and its invoice
-- id returned so an interrupted close can be resumed) but not invoiced again.
CREATE OR REPLACE FUNCTION public.process_auction_end(auction_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auction RECORD;
  v_lot RECORD;
  v_bid RECORD;
  v_caller_role public.user_role;
  v_commission_rate NUMERIC(5,2);
  v_premium INTEGER;
  v_total INTEGER;
  v_commission INTEGER;
  v_invoice_id UUID;
  v_results JSONB := '[]'::jsonb;
  v_invoice_ids JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = auction_uuid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction not found');
  END IF;

  -- Admin, the owning auctioneer, or a session without a JWT subject
  -- (service role / SQL editor).
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'admin'::public.user_role
       AND NOT EXISTS (
         SELECT 1 FROM auctioneers WHERE id = v_auction.auctioneer_id AND user_id = auth.uid()
       ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
    END IF;
  END IF;

  SELECT COALESCE(
           a.commission_rate_override,
           (SELECT (ps.value #>> '{}')::numeric FROM platform_settings ps WHERE ps.key = 'commission_rate'),
           1.2
         )
  INTO v_commission_rate
  FROM auctioneers a
  WHERE a.id = v_auction.auctioneer_id;
  v_commission_rate := COALESCE(v_commission_rate, 1.2);

  FOR v_lot IN
    SELECT * FROM lots WHERE auction_id = auction_uuid ORDER BY lot_number
  LOOP
    SELECT id INTO v_invoice_id FROM invoices WHERE lot_id = v_lot.id ORDER BY created_at ASC LIMIT 1;
    IF FOUND THEN
      v_results := v_results || jsonb_build_object(
        'lot_id', v_lot.id, 'lot_number', v_lot.lot_number,
        'invoice_id', v_invoice_id, 'status', 'already_invoiced'
      );
      v_invoice_ids := v_invoice_ids || to_jsonb(v_invoice_id);
      CONTINUE;
    END IF;

    SELECT b.id, b.bidder_id, b.amount INTO v_bid
    FROM bids b
    WHERE b.lot_id = v_lot.id
    ORDER BY b.amount DESC, b.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_object(
        'lot_id', v_lot.id, 'lot_number', v_lot.lot_number, 'status', 'no_bids'
      );
      CONTINUE;
    END IF;

    IF v_lot.reserve_price IS NOT NULL AND v_bid.amount < v_lot.reserve_price THEN
      v_results := v_results || jsonb_build_object(
        'lot_id', v_lot.id, 'lot_number', v_lot.lot_number,
        'high_bid', v_bid.amount, 'status', 'reserve_not_met'
      );
      CONTINUE;
    END IF;

    v_premium := ROUND(v_bid.amount * v_auction.buyer_premium_percent / 100);
    v_total := v_bid.amount + v_premium;
    v_commission := ROUND(v_bid.amount * v_commission_rate / 100);

    UPDATE bids SET is_winning = (id = v_bid.id) WHERE lot_id = v_lot.id;

    UPDATE lots
    SET winner_id = v_bid.bidder_id,
        is_sold = true,
        hammer_price = v_bid.amount,
        current_high_bid = v_bid.amount,
        updated_at = now()
    WHERE id = v_lot.id;

    INSERT INTO invoices (
      lot_id, buyer_id, hammer_price, buyer_premium_percent, buyer_premium_amount,
      total_amount, platform_commission_amount, payment_status, is_paid
    ) VALUES (
      v_lot.id, v_bid.bidder_id, v_bid.amount, v_auction.buyer_premium_percent, v_premium,
      v_total, v_commission, 'unpaid', false
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      v_bid.bidder_id,
      'You won lot #' || v_lot.lot_number || ': ' || COALESCE(v_lot.title, 'your lot'),
      'Hammer $' || to_char(v_bid.amount / 100.0, 'FM999,999,990.00')
        || ' plus ' || trim(trailing '.' from trim(trailing '0' from v_auction.buyer_premium_percent::text))
        || '% buyer''s premium: $' || to_char(v_total / 100.0, 'FM999,999,990.00')
        || ' will be charged to your card on file.',
      'auction_won'
    );

    v_results := v_results || jsonb_build_object(
      'lot_id', v_lot.id,
      'lot_number', v_lot.lot_number,
      'winner_id', v_bid.bidder_id,
      'hammer_price', v_bid.amount,
      'buyer_premium_amount', v_premium,
      'total_amount', v_total,
      'invoice_id', v_invoice_id,
      'status', 'invoiced'
    );
    v_invoice_ids := v_invoice_ids || to_jsonb(v_invoice_id);
  END LOOP;

  UPDATE auctions
  SET status = 'ended', updated_at = now()
  WHERE id = auction_uuid AND status <> 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'auction_id', auction_uuid,
    'commission_rate', v_commission_rate,
    'processed_lots', v_results,
    'invoice_ids', v_invoice_ids
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Processing error: ' || SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_auction_end(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_auction_end(UUID) TO authenticated, service_role;

-- ============================================================
-- 6. Escrow is gone
-- ============================================================
DROP FUNCTION IF EXISTS public.release_escrow_on_shipping(UUID);

-- ============================================================
-- 7. An auction cannot go live without a chargeable merchant account
-- ============================================================
-- auction_status enum (001): draft, scheduled, live, ended, completed. Only the
-- transition INTO 'live' is gated; already-live rows keep updating normally.
CREATE OR REPLACE FUNCTION public.enforce_auctioneer_payments_enabled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  IF NEW.status = 'live' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT payments_enabled INTO v_enabled FROM auctioneers WHERE id = NEW.auctioneer_id;
    IF NOT COALESCE(v_enabled, false) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Auction cannot go live until the auctioneer''s merchant account is approved (auctioneers.payments_enabled is false)',
        HINT = 'Complete the merchant application; an admin sets payments_enabled once PaymentCloud approves the account.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auctions_require_payments_enabled ON public.auctions;
CREATE TRIGGER auctions_require_payments_enabled
  BEFORE INSERT OR UPDATE OF status ON public.auctions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auctioneer_payments_enabled();

-- ============================================================
-- 8. PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 9. Verification (the SQL editor shows this result set; every ok = true)
-- ============================================================
SELECT check_name, ok
FROM (VALUES
  (10, 'exactly one place_bid overload remains',
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'place_bid') = 1),
  (11, 'place_bid(uuid, uuid, integer) exists',
       to_regprocedure('public.place_bid(uuid, uuid, integer)') IS NOT NULL),
  (12, 'old place_bid(uuid, uuid, integer, bid_type, integer) removed',
       to_regprocedure('public.place_bid(uuid, uuid, integer, bid_type, integer)') IS NULL),
  (13, 'anon cannot EXECUTE place_bid',
       NOT has_function_privilege('anon', 'public.place_bid(uuid, uuid, integer)', 'EXECUTE')),
  (20, 'process_auction_end(uuid) exists',
       to_regprocedure('public.process_auction_end(uuid)') IS NOT NULL),
  (21, 'release_escrow_on_shipping removed',
       to_regprocedure('public.release_escrow_on_shipping(uuid)') IS NULL),
  (30, 'auctioneers.gateway_processor_id exists',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auctioneers' AND column_name = 'gateway_processor_id')),
  (31, 'auctioneers.payments_enabled exists',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auctioneers' AND column_name = 'payments_enabled')),
  (32, 'authenticated cannot UPDATE auctioneers.payments_enabled',
       NOT has_column_privilege('authenticated', 'public.auctioneers', 'payments_enabled', 'UPDATE')),
  (33, 'authenticated cannot UPDATE auctioneers.gateway_processor_id',
       NOT has_column_privilege('authenticated', 'public.auctioneers', 'gateway_processor_id', 'UPDATE')),
  (40, 'invoices.payment_status exists with CHECK',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_payment_status_check')),
  (41, 'trigger invoices_sync_payment_flags exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'invoices_sync_payment_flags' AND NOT tgisinternal)),
  (42, 'no invoice has is_paid out of step with payment_status',
       NOT EXISTS (SELECT 1 FROM public.invoices
                   WHERE is_paid <> (payment_status IN ('paid', 'partially_refunded', 'disputed')))),
  (50, 'platform_settings.commission_rate = 1.2',
       (SELECT (value #>> '{}')::numeric FROM public.platform_settings WHERE key = 'commission_rate') = 1.2),
  (51, 'platform_settings.standard_commission_rate = 2.0',
       (SELECT (value #>> '{}')::numeric FROM public.platform_settings WHERE key = 'standard_commission_rate') = 2.0),
  (52, 'anon cannot read platform_settings',
       NOT has_table_privilege('anon', 'public.platform_settings', 'SELECT')),
  (60, 'trigger auctions_require_payments_enabled exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auctions_require_payments_enabled' AND NOT tgisinternal))
) AS checks (ord, check_name, ok)
ORDER BY ord;
