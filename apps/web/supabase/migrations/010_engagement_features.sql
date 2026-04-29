-- ============================================================
-- Engagement features: watchlist, proxy auto-bid, bidder reputation
-- ============================================================

-- ─── 1. Watchlist ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, lot_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON public.watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_lot ON public.watchlists(lot_id);

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own watchlist" ON public.watchlists;
CREATE POLICY "Users manage own watchlist" ON public.watchlists
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Public read watchlist counts" ON public.watchlists;
CREATE POLICY "Public read watchlist counts" ON public.watchlists
  FOR SELECT USING (true);

-- ─── 2. Max bids (proxy auto-bidding) ───────────────────────
CREATE TABLE IF NOT EXISTS public.max_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  max_amount INTEGER NOT NULL CHECK (max_amount > 0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, lot_id)
);
CREATE INDEX IF NOT EXISTS idx_max_bids_lot_active ON public.max_bids(lot_id) WHERE is_active = true;

ALTER TABLE public.max_bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own max bids" ON public.max_bids;
CREATE POLICY "Users manage own max bids" ON public.max_bids
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── 3. Updated place_bid with proxy auto-bid hook ─────────
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
    END;
  END IF;

  -- ─── PROXY AUTO-BID HOOK ───────────────────────────────
  -- If someone has a max_bid > current high bid (and isn't the new bidder),
  -- counter-bid on their behalf at min(max, p_amount + increment).
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

    -- Only counter if proxy user has the funds
    IF v_proxy_balance >= v_proxy_counter THEN
      INSERT INTO bids (lot_id, bidder_id, amount, is_proxy)
      VALUES (p_lot_id, v_proxy_user, v_proxy_counter, true)
      RETURNING id INTO v_proxy_bid_id;

      UPDATE lots SET current_high_bid = v_proxy_counter, bid_count = bid_count + 1 WHERE id = p_lot_id;

      INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
      VALUES (v_proxy_user, 'bid_hold', v_proxy_counter, v_proxy_balance - v_proxy_counter, 'Proxy auto-bid', v_proxy_bid_id, 'bid');

      -- Refund the user we just outbid (the original p_user_id)
      INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
      VALUES (p_user_id, 'bid_refund', p_amount,
              (v_user_balance - p_amount) + p_amount,
              'Outbid by proxy auto-bid', v_proxy_bid_id, 'bid');
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

-- Add is_proxy column to bids if missing
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS is_proxy BOOLEAN DEFAULT false;

-- ─── 4. Bidder reputation stats (materialized view) ─────────
DROP MATERIALIZED VIEW IF EXISTS public.bidder_stats CASCADE;
CREATE MATERIALIZED VIEW public.bidder_stats AS
WITH winning_bids AS (
  SELECT DISTINCT ON (b.lot_id)
    b.lot_id,
    b.bidder_id,
    b.amount
  FROM public.bids b
  JOIN public.lots l ON l.id = b.lot_id
  JOIN public.auctions a ON a.id = l.auction_id
  WHERE a.ends_at < NOW()
  ORDER BY b.lot_id, b.amount DESC, b.created_at ASC
)
SELECT
  u.id AS user_id,
  COUNT(DISTINCT b.lot_id) AS lots_bid_on,
  COUNT(DISTINCT wb.lot_id) AS lots_won,
  COALESCE(SUM(wb.amount), 0) AS lifetime_spend_cents,
  CASE
    WHEN COALESCE(SUM(wb.amount), 0) >= 100000 THEN 'gold'
    WHEN COALESCE(SUM(wb.amount), 0) >= 25000 THEN 'silver'
    WHEN COUNT(DISTINCT wb.lot_id) >= 1 THEN 'bronze'
    ELSE NULL
  END AS tier
FROM public.users u
LEFT JOIN public.bids b ON b.bidder_id = u.id
LEFT JOIN winning_bids wb ON wb.bidder_id = u.id
WHERE u.role = 'bidder'
GROUP BY u.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bidder_stats_user ON public.bidder_stats(user_id);

GRANT SELECT ON public.bidder_stats TO authenticated, anon;

CREATE OR REPLACE FUNCTION refresh_bidder_stats() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.bidder_stats;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION refresh_bidder_stats() TO authenticated;

-- Initial population
REFRESH MATERIALIZED VIEW public.bidder_stats;
