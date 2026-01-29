-- Enhanced place_bid function with anti-sniping logic
CREATE OR REPLACE FUNCTION place_bid(
  p_lot_id UUID,
  p_user_id UUID,
  p_amount_itc INTEGER
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
  v_result JSON;
BEGIN
  -- Get lot and auction info
  SELECT l.*, a.* INTO v_lot, v_auction
  FROM lots l
  JOIN auctions a ON l.auction_id = a.id
  WHERE l.id = p_lot_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Lot not found'
    );
  END IF;

  -- Check if auction is live
  IF NOW() < v_auction.starts_at THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Auction has not started yet'
    );
  END IF;

  IF NOW() > v_auction.ends_at THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Auction has ended'
    );
  END IF;

  -- Get current high bid
  SELECT amount_itc, user_id INTO v_current_high_bid, v_previous_high_bidder
  FROM bids
  WHERE lot_id = p_lot_id
  ORDER BY amount_itc DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    v_current_high_bid := v_lot.start_price_itc;
  END IF;

  -- Validate bid amount
  IF p_amount_itc <= v_current_high_bid THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bid must be higher than current high bid of ' || v_current_high_bid || ' ITC'
    );
  END IF;

  IF p_amount_itc < (v_current_high_bid + v_lot.bid_increment_itc) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bid must be at least ' || (v_current_high_bid + v_lot.bid_increment_itc) || ' ITC'
    );
  END IF;

  -- Check if user is already high bidder
  IF v_previous_high_bidder = p_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are already the high bidder'
    );
  END IF;

  -- Calculate user's available balance
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('purchase', 'bid_refund', 'escrow_release') THEN amount_itc
      WHEN type IN ('bid_spend', 'escrow_hold') THEN -amount_itc
      ELSE 0
    END
  ), 0) INTO v_user_balance
  FROM wallet_ledger
  WHERE user_id = p_user_id;

  -- Check if user has sufficient balance
  IF v_user_balance < p_amount_itc THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient balance. You have ' || v_user_balance || ' ITC, need ' || p_amount_itc || ' ITC'
    );
  END IF;

  -- Store previous high bid amount for refund
  v_previous_high_amount := v_current_high_bid;

  -- Check for anti-sniping
  v_time_remaining := v_auction.ends_at - NOW();
  IF v_time_remaining <= INTERVAL '1 second' * v_auction.anti_sniping_seconds THEN
    v_new_end_time := NOW() + INTERVAL '1 second' * v_auction.anti_sniping_seconds;

    -- Update auction end time
    UPDATE auctions
    SET ends_at = v_new_end_time
    WHERE id = v_auction.id;
  ELSE
    v_new_end_time := v_auction.ends_at;
  END IF;

  -- Insert the new bid
  INSERT INTO bids (lot_id, user_id, amount_itc)
  VALUES (p_lot_id, p_user_id, p_amount_itc);

  -- Deduct credits from bidder
  INSERT INTO wallet_ledger (user_id, type, amount_itc, ref_table, ref_id)
  VALUES (p_user_id, 'bid_spend', p_amount_itc, 'bids', (
    SELECT id FROM bids WHERE lot_id = p_lot_id AND user_id = p_user_id AND amount_itc = p_amount_itc ORDER BY created_at DESC LIMIT 1
  ));

  -- Refund previous high bidder if exists
  IF v_previous_high_bidder IS NOT NULL AND v_previous_high_bidder != p_user_id THEN
    INSERT INTO wallet_ledger (user_id, type, amount_itc, ref_table, ref_id)
    VALUES (v_previous_high_bidder, 'bid_refund', v_previous_high_amount, 'bids', (
      SELECT id FROM bids WHERE lot_id = p_lot_id AND user_id = p_user_id AND amount_itc = p_amount_itc ORDER BY created_at DESC LIMIT 1
    ));
  END IF;

  -- Return success with details
  v_result := json_build_object(
    'success', true,
    'bid_amount', p_amount_itc,
    'previous_high', v_current_high_bid,
    'new_end_time', CASE WHEN v_new_end_time != v_auction.ends_at THEN v_new_end_time ELSE NULL END,
    'anti_sniping_triggered', v_new_end_time != v_auction.ends_at,
    'refunded_user', v_previous_high_bidder,
    'refunded_amount', CASE WHEN v_previous_high_bidder IS NOT NULL THEN v_previous_high_amount ELSE NULL END
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION place_bid TO authenticated;