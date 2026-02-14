-- Drop existing function
DROP FUNCTION IF EXISTS place_bid(UUID, UUID, INTEGER);

-- Create the place_bid function with correct column names
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
  v_result JSON;
BEGIN
  -- Get lot info
  SELECT * INTO v_lot FROM lots WHERE id = p_lot_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lot not found');
  END IF;

  -- Get auction info
  SELECT * INTO v_auction FROM auctions WHERE id = v_lot.auction_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Auction not found');
  END IF;

  -- Check if auction is live
  IF NOW() < v_auction.starts_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has not started yet');
  END IF;
  IF NOW() > v_auction.ends_at THEN
    RETURN json_build_object('success', false, 'error', 'Auction has ended');
  END IF;

  -- Get current high bid (uses 'amount' and 'bidder_id' columns)
  SELECT amount, bidder_id INTO v_current_high_bid, v_previous_high_bidder
  FROM bids WHERE lot_id = p_lot_id
  ORDER BY amount DESC, created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    v_current_high_bid := v_lot.starting_bid;
  END IF;

  -- Validate bid amount
  IF p_amount <= v_current_high_bid THEN
    RETURN json_build_object('success', false, 'error', 'Bid must be higher than current high bid');
  END IF;
  IF p_amount < (v_current_high_bid + v_lot.increment) THEN
    RETURN json_build_object('success', false, 'error', 'Bid must meet minimum increment');
  END IF;

  -- Check if user is already high bidder
  IF v_previous_high_bidder = p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You are already the high bidder');
  END IF;

  -- Calculate user's available balance
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type IN ('purchase', 'bid_refund', 'escrow_release') THEN amount
      WHEN transaction_type IN ('bid_hold', 'escrow_hold') THEN -amount
      ELSE 0
    END
  ), 0) INTO v_user_balance FROM wallet_ledger WHERE user_id = p_user_id;

  -- Check if user has sufficient balance
  IF v_user_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_previous_high_amount := v_current_high_bid;

  -- Check for anti-sniping
  v_time_remaining := v_auction.ends_at - NOW();
  IF v_time_remaining <= INTERVAL '1 second' * v_auction.anti_sniping_seconds THEN
    v_new_end_time := NOW() + INTERVAL '1 second' * v_auction.anti_sniping_seconds;
    UPDATE auctions SET ends_at = v_new_end_time WHERE id = v_auction.id;
  ELSE
    v_new_end_time := v_auction.ends_at;
  END IF;

  -- Insert the new bid
  INSERT INTO bids (lot_id, bidder_id, amount)
  VALUES (p_lot_id, p_user_id, p_amount)
  RETURNING id INTO v_new_bid_id;

  -- Update lot's current high bid
  UPDATE lots SET current_high_bid = p_amount, bid_count = bid_count + 1 WHERE id = p_lot_id;

  -- Deduct credits from bidder
  INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type)
  VALUES (p_user_id, 'bid_hold', p_amount, v_user_balance - p_amount, 'Bid placed on lot', v_new_bid_id, 'bid');

  -- Refund previous high bidder if exists
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

  RETURN json_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'bid_amount', p_amount,
    'previous_high', v_current_high_bid,
    'anti_sniping_triggered', v_new_end_time != v_auction.ends_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION place_bid(UUID, UUID, INTEGER) TO anon;
