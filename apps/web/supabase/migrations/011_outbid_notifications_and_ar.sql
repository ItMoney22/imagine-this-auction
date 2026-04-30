-- ============================================================
-- Outbid notifications, AR preview, nightly bidder_stats refresh
-- ============================================================

-- ─── 1. AR model URL on lots (USDZ for iOS Quick Look) ──────
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS ar_model_url TEXT;

-- ─── 2. place_bid: insert outbid notification ───────────────
DROP FUNCTION IF EXISTS place_bid(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION place_bid(
  p_lot_id UUID,
  p_user_id UUID,
  p_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  v_auction RECORD;
  v_lot RECORD;
  v_current_high_bid INTEGER := 0;
  v_user_balance INTEGER := 0;
  v_previous_high_bidder UUID;
  v_previous_high_amount INTEGER := 0;
  v_new_end_time TIMESTAMPTZ;
  v_time_remaining INTERVAL;
  v_new_bid_id UUID;
  v_proxy_user UUID;
  v_proxy_max INTEGER;
  v_proxy_counter INTEGER;
  v_proxy_balance INTEGER;
  v_proxy_bid_id UUID;
BEGIN
  SELECT * INTO v_lot FROM lots WHERE id = p_lot_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lot not found');
  END IF;

  SELECT * INTO v_auction FROM auctions WHERE id = v_lot.auction_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Auction not found');
  END IF;

  IF NOW() < v_auction.starts_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has not started yet');
  END IF;
  IF NOW() > v_auction.ends_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has ended');
  END IF;

  SELECT amount, bidder_id INTO v_current_high_bid, v_previous_high_bidder
  FROM bids WHERE lot_id = p_lot_id
  ORDER BY amount DESC, created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    v_current_high_bid := v_lot.starting_bid;
  END IF;

  IF p_amount <= v_current_high_bid THEN
    RETURN json_build_object('success', false, 'error', 'Bid must be higher than current high bid');
  END IF;
  IF p_amount < (v_current_high_bid + v_lot.increment) THEN
    RETURN json_build_object('success', false, 'error', 'Bid must meet minimum increment');
  END IF;
  IF v_previous_high_bidder = p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You are already the high bidder');
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type IN ('purchase', 'bid_refund', 'escrow_release') THEN amount
      WHEN transaction_type IN ('bid_hold', 'escrow_hold') THEN -amount
      ELSE 0
    END
  ), 0) INTO v_user_balance FROM wallet_ledger WHERE user_id = p_user_id;

  IF v_user_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_previous_high_amount := v_current_high_bid;

  v_time_remaining := v_auction.ends_at - NOW();
  IF v_time_remaining <= INTERVAL '1 second' * v_auction.anti_sniping_seconds THEN
    v_new_end_time := NOW() + INTERVAL '1 second' * v_auction.anti_sniping_seconds;
    UPDATE auctions SET ends_at = v_new_end_time WHERE id = v_auction.id;
  ELSE
    v_new_end_time := v_auction.ends_at;
  END IF;

  INSERT INTO bids (lot_id, bidder_id, amount)
  VALUES (p_lot_id, p_user_id, p_amount)
  RETURNING id INTO v_new_bid_id;

  UPDATE lots SET current_high_bid = p_amount, bid_count = bid_count + 1 WHERE id = p_lot_id;

  INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
  VALUES (p_user_id, 'bid_hold', p_amount, v_user_balance - p_amount, 'Bid placed on lot', v_new_bid_id, 'bid');

  IF v_previous_high_bidder IS NOT NULL AND v_previous_high_bidder != p_user_id AND v_previous_high_amount > 0 THEN
    DECLARE v_prev_balance INTEGER;
    BEGIN
      SELECT COALESCE(SUM(
        CASE
          WHEN transaction_type IN ('purchase', 'bid_refund', 'escrow_release') THEN amount
          WHEN transaction_type IN ('bid_hold', 'escrow_hold') THEN -amount
          ELSE 0
        END
      ), 0) INTO v_prev_balance FROM wallet_ledger WHERE user_id = v_previous_high_bidder;

      INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
      VALUES (v_previous_high_bidder, 'bid_refund', v_previous_high_amount, v_prev_balance + v_previous_high_amount, 'Outbid refund', v_new_bid_id, 'bid');

      -- ─── OUTBID NOTIFICATION ─────────────────────────────────
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (
        v_previous_high_bidder,
        'You''ve been outbid on ' || COALESCE(v_lot.title, 'a lot'),
        'Your bid of $' || (v_previous_high_amount / 100.0) || ' was beaten. Tap to bid again.',
        'outbid'
      );
    END;
  END IF;

  -- ─── PROXY AUTO-BID HOOK ────────────────────────────────────
  SELECT user_id, max_amount INTO v_proxy_user, v_proxy_max
  FROM max_bids
  WHERE lot_id = p_lot_id
    AND user_id != p_user_id
    AND is_active = true
    AND max_amount > p_amount
  ORDER BY max_amount DESC, updated_at ASC
  LIMIT 1;

  IF FOUND THEN
    v_proxy_counter := LEAST(v_proxy_max, p_amount + v_lot.increment);

    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('purchase', 'bid_refund', 'escrow_release') THEN amount
        WHEN transaction_type IN ('bid_hold', 'escrow_hold') THEN -amount
        ELSE 0
      END
    ), 0) INTO v_proxy_balance FROM wallet_ledger WHERE user_id = v_proxy_user;

    IF v_proxy_balance >= v_proxy_counter THEN
      INSERT INTO bids (lot_id, bidder_id, amount, is_proxy)
      VALUES (p_lot_id, v_proxy_user, v_proxy_counter, true)
      RETURNING id INTO v_proxy_bid_id;

      UPDATE lots SET current_high_bid = v_proxy_counter, bid_count = bid_count + 1 WHERE id = p_lot_id;

      INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
      VALUES (v_proxy_user, 'bid_hold', v_proxy_counter, v_proxy_balance - v_proxy_counter, 'Proxy auto-bid', v_proxy_bid_id, 'bid');

      INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
      VALUES (p_user_id, 'bid_refund', p_amount,
              (v_user_balance - p_amount) + p_amount,
              'Outbid by proxy auto-bid', v_proxy_bid_id, 'bid');

      -- Notify the proxy-outbid user
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (
        p_user_id,
        'Outbid by another bidder''s max',
        'Someone had a higher max bid set on ' || COALESCE(v_lot.title, 'this lot') || '. Bid again to retake the lead.',
        'outbid'
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'bid_amount', p_amount,
    'previous_high', v_current_high_bid,
    'anti_sniping_triggered', v_new_end_time != v_auction.ends_at,
    'proxy_counter_bid', COALESCE(v_proxy_bid_id IS NOT NULL, false)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) TO anon;

-- ─── 3. Schedule nightly bidder_stats refresh ───────────────
-- Requires pg_cron extension (Supabase enables on request; falls back to manual call).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any prior version
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'refresh-bidder-stats-nightly';

    PERFORM cron.schedule(
      'refresh-bidder-stats-nightly',
      '0 3 * * *',
      $cron$ SELECT public.refresh_bidder_stats(); $cron$
    );
  END IF;
END $$;
