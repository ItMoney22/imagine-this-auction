-- ImagineThisAuction - Performance Indexes and Database Functions
-- Task B: Schema & Migrations

-- ==========================================
-- PERFORMANCE INDEXES
-- ==========================================

-- Critical bidding queries
CREATE INDEX idx_bids_lot_created_desc ON bids(lot_id, created_at DESC);
CREATE INDEX idx_bids_bidder_created_desc ON bids(bidder_id, created_at DESC);
CREATE INDEX idx_bids_winning ON bids(lot_id) WHERE is_winning = true;

-- Wallet and transaction queries
CREATE INDEX idx_wallet_ledger_user_created_desc ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_reference ON wallet_ledger(reference_type, reference_id);

-- Auction and lot queries
CREATE INDEX idx_lots_auction_lot_number ON lots(auction_id, lot_number);
CREATE INDEX idx_auctions_status_timing ON auctions(status, starts_at, ends_at);
CREATE INDEX idx_auctions_auctioneer ON auctions(auctioneer_id);

-- User and role queries
CREATE INDEX idx_users_role ON users(role) WHERE role != 'bidder';
CREATE INDEX idx_auctioneers_approved ON auctioneers(user_id) WHERE is_approved = true;

-- Invoice and payout queries
CREATE INDEX idx_invoices_buyer ON invoices(buyer_id);
CREATE INDEX idx_invoices_lot ON invoices(lot_id);
CREATE INDEX idx_payouts_auctioneer ON payouts_due(auctioneer_id) WHERE is_paid = false;

-- Stripe event processing
CREATE INDEX idx_stripe_events_processed ON stripe_events(processed, created_at) WHERE processed = false;

-- ==========================================
-- WALLET MANAGEMENT FUNCTIONS
-- ==========================================

-- Function to get current wallet balance
CREATE OR REPLACE FUNCTION get_wallet_balance(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    SELECT COALESCE(
        (SELECT balance_after FROM wallet_ledger
         WHERE user_id = user_uuid
         ORDER BY created_at DESC
         LIMIT 1),
        0
    ) INTO current_balance;

    RETURN current_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add ITC credits (from Stripe purchase)
CREATE OR REPLACE FUNCTION add_wallet_credits(
    user_uuid UUID,
    credit_amount INTEGER,
    stripe_event_id TEXT,
    purchase_description TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
BEGIN
    -- Get current balance
    current_balance := get_wallet_balance(user_uuid);
    new_balance := current_balance + credit_amount;

    -- Insert credit transaction
    INSERT INTO wallet_ledger (
        user_id,
        transaction_type,
        amount,
        balance_after,
        description,
        reference_id,
        reference_type,
        metadata
    ) VALUES (
        user_uuid,
        'purchase',
        credit_amount,
        new_balance,
        purchase_description,
        stripe_event_id::uuid,
        'stripe_event',
        jsonb_build_object('stripe_event_id', stripe_event_id)
    );

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- BIDDING FUNCTIONS
-- ==========================================

-- Function to place a bid with all validations and wallet operations
CREATE OR REPLACE FUNCTION place_bid(
    lot_uuid UUID,
    bidder_uuid UUID,
    bid_amount INTEGER,
    bid_type_param bid_type DEFAULT 'regular',
    max_amount_param INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    auction_record RECORD;
    lot_record RECORD;
    current_balance INTEGER;
    previous_bid_record RECORD;
    new_balance INTEGER;
    bid_id UUID;
    result JSONB;
BEGIN
    -- Get lot and auction info in one query
    SELECT
        l.*,
        a.status as auction_status,
        a.ends_at,
        a.anti_sniping_seconds
    INTO lot_record
    FROM lots l
    JOIN auctions a ON l.auction_id = a.id
    WHERE l.id = lot_uuid;

    -- Validate lot exists
    IF lot_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Lot not found');
    END IF;

    -- Validate auction is live
    IF lot_record.auction_status != 'live' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Auction is not live');
    END IF;

    -- Validate bid amount
    IF bid_amount <= lot_record.current_high_bid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bid must be higher than current high bid');
    END IF;

    -- Validate minimum increment
    IF bid_amount < lot_record.current_high_bid + lot_record.increment THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bid does not meet minimum increment');
    END IF;

    -- Check wallet balance
    current_balance := get_wallet_balance(bidder_uuid);
    IF current_balance < bid_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
    END IF;

    -- Get previous winning bid to refund
    SELECT * INTO previous_bid_record
    FROM bids
    WHERE lot_id = lot_uuid AND is_winning = true;

    -- Start transaction-like operations
    BEGIN
        -- Mark all previous bids as not winning
        UPDATE bids SET is_winning = false WHERE lot_id = lot_uuid;

        -- Insert new bid
        INSERT INTO bids (
            lot_id,
            bidder_id,
            amount,
            type,
            max_amount,
            is_winning
        ) VALUES (
            lot_uuid,
            bidder_uuid,
            bid_amount,
            bid_type_param,
            max_amount_param,
            true
        ) RETURNING id INTO bid_id;

        -- Update lot with new high bid
        UPDATE lots
        SET
            current_high_bid = bid_amount,
            bid_count = bid_count + 1,
            updated_at = now()
        WHERE id = lot_uuid;

        -- Handle wallet operations
        new_balance := current_balance - bid_amount;

        -- Add bid hold transaction
        INSERT INTO wallet_ledger (
            user_id,
            transaction_type,
            amount,
            balance_after,
            description,
            reference_id,
            reference_type
        ) VALUES (
            bidder_uuid,
            'bid_hold',
            -bid_amount,
            new_balance,
            'Bid placed on lot #' || lot_record.lot_number,
            bid_id,
            'bid'
        );

        -- Refund previous bidder if exists
        IF previous_bid_record.id IS NOT NULL AND previous_bid_record.bidder_id != bidder_uuid THEN
            -- Get previous bidder's current balance
            SELECT balance_after INTO current_balance
            FROM wallet_ledger
            WHERE user_id = previous_bid_record.bidder_id
            ORDER BY created_at DESC
            LIMIT 1;

            -- Add refund transaction
            INSERT INTO wallet_ledger (
                user_id,
                transaction_type,
                amount,
                balance_after,
                description,
                reference_id,
                reference_type
            ) VALUES (
                previous_bid_record.bidder_id,
                'bid_refund',
                previous_bid_record.amount,
                COALESCE(current_balance, 0) + previous_bid_record.amount,
                'Outbid refund for lot #' || lot_record.lot_number,
                previous_bid_record.id,
                'bid'
            );
        END IF;

        -- Check for anti-sniping extension
        IF lot_record.ends_at - now() < (lot_record.anti_sniping_seconds || ' seconds')::INTERVAL THEN
            UPDATE auctions
            SET ends_at = now() + (lot_record.anti_sniping_seconds || ' seconds')::INTERVAL
            WHERE id = lot_record.auction_id;
        END IF;

        result := jsonb_build_object(
            'success', true,
            'bid_id', bid_id,
            'new_high_bid', bid_amount,
            'anti_snipe_extended', lot_record.ends_at - now() < (lot_record.anti_sniping_seconds || ' seconds')::INTERVAL
        );

        RETURN result;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- AUCTION END PROCESSING
-- ==========================================

-- Function to process auction end and create invoices
CREATE OR REPLACE FUNCTION process_auction_end(auction_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    auction_record RECORD;
    lot_record RECORD;
    winning_bid RECORD;
    buyer_premium_amount INTEGER;
    total_amount INTEGER;
    invoice_id UUID;
    results JSONB := '[]'::jsonb;
BEGIN
    -- Get auction info
    SELECT * INTO auction_record FROM auctions WHERE id = auction_uuid;

    IF auction_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Auction not found');
    END IF;

    -- Process each lot in the auction
    FOR lot_record IN
        SELECT * FROM lots WHERE auction_id = auction_uuid
    LOOP
        -- Get winning bid
        SELECT b.*, u.first_name, u.last_name, u.email
        INTO winning_bid
        FROM bids b
        JOIN users u ON b.bidder_id = u.id
        WHERE b.lot_id = lot_record.id AND b.is_winning = true;

        -- If there's a winning bid, create invoice
        IF winning_bid.id IS NOT NULL THEN
            -- Calculate buyer's premium
            buyer_premium_amount := ROUND(winning_bid.amount * auction_record.buyer_premium_percent / 100);
            total_amount := winning_bid.amount + buyer_premium_amount;

            -- Update lot as sold
            UPDATE lots
            SET
                winner_id = winning_bid.bidder_id,
                is_sold = true,
                hammer_price = winning_bid.amount,
                updated_at = now()
            WHERE id = lot_record.id;

            -- Create invoice
            INSERT INTO invoices (
                lot_id,
                buyer_id,
                hammer_price,
                buyer_premium_percent,
                buyer_premium_amount,
                total_amount
            ) VALUES (
                lot_record.id,
                winning_bid.bidder_id,
                winning_bid.amount,
                auction_record.buyer_premium_percent,
                buyer_premium_amount,
                total_amount
            ) RETURNING id INTO invoice_id;

            -- Move winning bid amount to escrow
            INSERT INTO wallet_ledger (
                user_id,
                transaction_type,
                amount,
                balance_after,
                description,
                reference_id,
                reference_type
            ) VALUES (
                winning_bid.bidder_id,
                'escrow_hold',
                0, -- No balance change, just moving from bid_hold to escrow_hold
                get_wallet_balance(winning_bid.bidder_id),
                'Escrow hold for won lot #' || lot_record.lot_number,
                invoice_id,
                'invoice'
            );

            results := results || jsonb_build_object(
                'lot_id', lot_record.id,
                'lot_number', lot_record.lot_number,
                'winner_id', winning_bid.bidder_id,
                'hammer_price', winning_bid.amount,
                'invoice_id', invoice_id
            );
        END IF;
    END LOOP;

    -- Update auction status
    UPDATE auctions SET status = 'ended', updated_at = now() WHERE id = auction_uuid;

    RETURN jsonb_build_object('success', true, 'processed_lots', results);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Processing error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- ESCROW AND PAYOUT FUNCTIONS
-- ==========================================

-- Function to release escrow when item is shipped
CREATE OR REPLACE FUNCTION release_escrow_on_shipping(invoice_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    invoice_record RECORD;
    lot_record RECORD;
    auctioneer_record RECORD;
    platform_commission INTEGER;
    auctioneer_payout INTEGER;
BEGIN
    -- Get invoice and related info
    SELECT i.*, l.auction_id
    INTO invoice_record
    FROM invoices i
    JOIN lots l ON i.lot_id = l.id
    WHERE i.id = invoice_uuid AND i.is_shipped = true;

    IF invoice_record.id IS NULL THEN
        RETURN false;
    END IF;

    -- Get auctioneer info
    SELECT au.*
    INTO auctioneer_record
    FROM auctioneers au
    JOIN auctions a ON au.id = a.auctioneer_id
    WHERE a.id = invoice_record.auction_id;

    -- Calculate platform commission (1.2% default)
    platform_commission := ROUND(invoice_record.hammer_price * 1.2 / 100);
    auctioneer_payout := invoice_record.hammer_price - platform_commission;

    -- Release escrow
    INSERT INTO wallet_ledger (
        user_id,
        transaction_type,
        amount,
        balance_after,
        description,
        reference_id,
        reference_type
    ) VALUES (
        invoice_record.buyer_id,
        'escrow_release',
        0, -- No balance change for buyer
        get_wallet_balance(invoice_record.buyer_id),
        'Escrow released for shipped item',
        invoice_uuid,
        'invoice'
    );

    -- Create payout due record
    INSERT INTO payouts_due (
        auctioneer_id,
        invoice_id,
        amount,
        platform_commission
    ) VALUES (
        auctioneer_record.id,
        invoice_uuid,
        auctioneer_payout,
        platform_commission
    );

    RETURN true;

EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- UTILITY FUNCTIONS
-- ==========================================

-- Function to get user's active bids
CREATE OR REPLACE FUNCTION get_user_active_bids(user_uuid UUID)
RETURNS TABLE (
    bid_id UUID,
    lot_id UUID,
    lot_title TEXT,
    auction_title TEXT,
    bid_amount INTEGER,
    is_winning BOOLEAN,
    ends_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        l.id,
        l.title,
        a.title,
        b.amount,
        b.is_winning,
        a.ends_at
    FROM bids b
    JOIN lots l ON b.lot_id = l.id
    JOIN auctions a ON l.auction_id = a.id
    WHERE b.bidder_id = user_uuid
    AND a.status IN ('live', 'scheduled')
    ORDER BY a.ends_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search lots
CREATE OR REPLACE FUNCTION search_lots(
    search_query TEXT DEFAULT NULL,
    category_filter TEXT DEFAULT NULL,
    min_price INTEGER DEFAULT NULL,
    max_price INTEGER DEFAULT NULL,
    auction_status_filter auction_status DEFAULT NULL
)
RETURNS TABLE (
    lot_id UUID,
    lot_number INTEGER,
    title TEXT,
    current_high_bid INTEGER,
    auction_title TEXT,
    auction_status auction_status,
    ends_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.lot_number,
        l.title,
        l.current_high_bid,
        a.title,
        a.status,
        a.ends_at
    FROM lots l
    JOIN auctions a ON l.auction_id = a.id
    WHERE
        (search_query IS NULL OR l.title ILIKE '%' || search_query || '%')
        AND (category_filter IS NULL OR l.category = category_filter)
        AND (min_price IS NULL OR l.current_high_bid >= min_price)
        AND (max_price IS NULL OR l.current_high_bid <= max_price)
        AND (auction_status_filter IS NULL OR a.status = auction_status_filter)
        AND a.status IN ('scheduled', 'live', 'ended')
    ORDER BY a.ends_at ASC, l.lot_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;