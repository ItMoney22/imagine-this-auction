-- ==========================================
-- ImagineThisAuction - Complete Database Schema
-- Single migration file with all tables, indexes, RLS, and functions
-- ==========================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE user_role AS ENUM ('bidder', 'auctioneer', 'admin');
CREATE TYPE auction_status AS ENUM ('draft', 'scheduled', 'live', 'ended', 'completed');
CREATE TYPE bid_type AS ENUM ('regular', 'proxy');
CREATE TYPE transaction_type AS ENUM ('purchase', 'bid_hold', 'bid_refund', 'escrow_hold', 'escrow_release', 'payout');

-- ==========================================
-- TABLES
-- ==========================================

-- Users table - extends Supabase auth.users
CREATE TABLE users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role user_role DEFAULT 'bidder' NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    is_approved BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Auctioneers table - company/business information
CREATE TABLE auctioneers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    company_name TEXT NOT NULL,
    business_license TEXT,
    tax_id TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    website TEXT,
    logo_url TEXT,
    is_approved BOOLEAN DEFAULT false NOT NULL,
    approval_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Auctions table - auction events
CREATE TABLE auctions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    auctioneer_id UUID REFERENCES auctioneers(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status auction_status DEFAULT 'draft' NOT NULL,
    buyer_premium_percent DECIMAL(5,2) DEFAULT 10.00 NOT NULL,
    anti_sniping_seconds INTEGER DEFAULT 60 NOT NULL,
    terms_and_conditions TEXT,
    preview_start TIMESTAMP WITH TIME ZONE,
    preview_end TIMESTAMP WITH TIME ZONE,
    pickup_start TIMESTAMP WITH TIME ZONE,
    pickup_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT valid_auction_timing CHECK (starts_at < ends_at),
    CONSTRAINT valid_preview_timing CHECK (preview_start IS NULL OR preview_end IS NULL OR preview_start < preview_end),
    CONSTRAINT valid_pickup_timing CHECK (pickup_start IS NULL OR pickup_end IS NULL OR pickup_start < pickup_end)
);

-- Lots table - individual auction items
CREATE TABLE lots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE NOT NULL,
    lot_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    starting_bid INTEGER DEFAULT 100 NOT NULL, -- in cents
    reserve_price INTEGER, -- in cents, NULL = no reserve
    increment INTEGER DEFAULT 25 NOT NULL, -- in cents
    current_high_bid INTEGER DEFAULT 0 NOT NULL, -- in cents
    bid_count INTEGER DEFAULT 0 NOT NULL,
    category TEXT,
    dimensions TEXT,
    condition_report TEXT,
    provenance TEXT,
    estimate_low INTEGER, -- in cents
    estimate_high INTEGER, -- in cents
    images JSONB DEFAULT '[]'::jsonb,
    winner_id UUID REFERENCES users(id),
    is_sold BOOLEAN DEFAULT false NOT NULL,
    hammer_price INTEGER, -- final winning bid in cents
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT positive_starting_bid CHECK (starting_bid > 0),
    CONSTRAINT positive_increment CHECK (increment > 0),
    CONSTRAINT valid_reserve CHECK (reserve_price IS NULL OR reserve_price >= starting_bid),
    CONSTRAINT valid_estimates CHECK (estimate_low IS NULL OR estimate_high IS NULL OR estimate_low <= estimate_high),
    CONSTRAINT unique_lot_number UNIQUE (auction_id, lot_number)
);

-- Bids table - bidding history
CREATE TABLE bids (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lot_id UUID REFERENCES lots(id) ON DELETE CASCADE NOT NULL,
    bidder_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL, -- in cents
    type bid_type DEFAULT 'regular' NOT NULL,
    max_amount INTEGER, -- for proxy bids, in cents
    is_winning BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT positive_bid_amount CHECK (amount > 0),
    CONSTRAINT valid_proxy_bid CHECK (type = 'regular' OR max_amount IS NOT NULL)
);

-- Wallet ledger - all ITC credit transactions
CREATE TABLE wallet_ledger (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    transaction_type transaction_type NOT NULL,
    amount INTEGER NOT NULL, -- in ITC (cents), positive = credit, negative = debit
    balance_after INTEGER NOT NULL, -- running balance in ITC (cents)
    description TEXT NOT NULL,
    reference_id UUID, -- references bids, invoices, stripe events, etc.
    reference_type TEXT, -- 'bid', 'invoice', 'stripe_event', etc.
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Invoices - winner invoices with buyer's premium
CREATE TABLE invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lot_id UUID REFERENCES lots(id) ON DELETE CASCADE NOT NULL,
    buyer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    hammer_price INTEGER NOT NULL, -- in cents
    buyer_premium_percent DECIMAL(5,2) NOT NULL,
    buyer_premium_amount INTEGER NOT NULL, -- calculated buyer's premium in cents
    total_amount INTEGER NOT NULL, -- hammer_price + buyer_premium_amount
    is_paid BOOLEAN DEFAULT false NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    shipping_required BOOLEAN DEFAULT true NOT NULL,
    is_shipped BOOLEAN DEFAULT false NOT NULL,
    shipped_at TIMESTAMP WITH TIME ZONE,
    tracking_number TEXT,
    shipping_address JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT positive_amounts CHECK (hammer_price > 0 AND buyer_premium_amount >= 0 AND total_amount > 0),
    CONSTRAINT valid_buyer_premium CHECK (buyer_premium_percent >= 0 AND buyer_premium_percent <= 100)
);

-- Stripe events - webhook event tracking for idempotency
CREATE TABLE stripe_events (
    id TEXT PRIMARY KEY, -- Stripe event ID
    event_type TEXT NOT NULL,
    processed BOOLEAN DEFAULT false NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Payouts due - auctioneers' pending payouts
CREATE TABLE payouts_due (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    auctioneer_id UUID REFERENCES auctioneers(id) ON DELETE CASCADE NOT NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL, -- payout amount in cents (after platform commission)
    platform_commission INTEGER NOT NULL, -- platform's commission in cents
    is_paid BOOLEAN DEFAULT false NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    payment_reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT positive_payout_amount CHECK (amount > 0),
    CONSTRAINT positive_commission CHECK (platform_commission >= 0)
);

-- Audit log - system actions and changes
CREATE TABLE audit_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
-- ROW LEVEL SECURITY
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctioneers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts_due ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
    RETURN (
        SELECT role FROM users WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is auctioneer for specific record
CREATE OR REPLACE FUNCTION is_auctioneer_for_auction(auction_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auctions a
        JOIN auctioneers au ON a.auctioneer_id = au.id
        WHERE a.id = auction_uuid AND au.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- USERS TABLE POLICIES
CREATE POLICY "Users can view own profile and public info" ON users
    FOR SELECT USING (
        id = auth.uid() OR  -- Own profile
        get_user_role() = 'admin' OR  -- Admins see all
        (role = 'auctioneer' AND is_approved = true)  -- Approved auctioneers visible publicly
    );

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Authenticated users can create profile" ON users
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin full access users" ON users
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- AUCTIONEERS TABLE POLICIES
CREATE POLICY "Auctioneer profile visibility" ON auctioneers
    FOR SELECT USING (
        user_id = auth.uid() OR  -- Own profile
        get_user_role() = 'admin' OR  -- Admins see all
        is_approved = true  -- Public can see approved auctioneers
    );

CREATE POLICY "Auctioneers can update own profile" ON auctioneers
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can create auctioneer profile" ON auctioneers
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin full access auctioneers" ON auctioneers
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- AUCTIONS TABLE POLICIES
CREATE POLICY "Auction visibility" ON auctions
    FOR SELECT USING (
        status IN ('scheduled', 'live', 'ended', 'completed') OR  -- Public auctions
        get_user_role() = 'admin' OR  -- Admins see all
        is_auctioneer_for_auction(id)  -- Auctioneers see their own
    );

CREATE POLICY "Auctioneers manage own auctions" ON auctions
    FOR UPDATE USING (is_auctioneer_for_auction(id))
    WITH CHECK (is_auctioneer_for_auction(id));

CREATE POLICY "Auctioneers can create auctions" ON auctions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM auctioneers
            WHERE id = auctioneer_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Admin full access auctions" ON auctions
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- LOTS TABLE POLICIES
CREATE POLICY "Lot visibility" ON lots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auctions a
            WHERE a.id = auction_id
            AND (
                a.status IN ('scheduled', 'live', 'ended', 'completed') OR
                get_user_role() = 'admin' OR
                is_auctioneer_for_auction(a.id)
            )
        )
    );

CREATE POLICY "Auctioneers manage own lots" ON lots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auctions a
            WHERE a.id = auction_id AND is_auctioneer_for_auction(a.id)
        )
    );

CREATE POLICY "Admin full access lots" ON lots
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- BIDS TABLE POLICIES
CREATE POLICY "Bid visibility" ON bids
    FOR SELECT USING (
        bidder_id = auth.uid() OR  -- Own bids
        get_user_role() = 'admin' OR  -- Admins see all
        is_winning = true OR  -- Public can see winning bids
        EXISTS (
            SELECT 1 FROM lots l
            JOIN auctions a ON l.auction_id = a.id
            WHERE l.id = lot_id AND is_auctioneer_for_auction(a.id)
        )
    );

CREATE POLICY "Authenticated users can place bids" ON bids
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        bidder_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM lots l
            JOIN auctions a ON l.auction_id = a.id
            WHERE l.id = lot_id AND a.status = 'live'
        )
    );

CREATE POLICY "Admin full access bids" ON bids
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- WALLET LEDGER POLICIES
CREATE POLICY "Users view own wallet" ON wallet_ledger
    FOR SELECT USING (
        user_id = auth.uid() OR
        get_user_role() = 'admin'
    );

CREATE POLICY "System can insert wallet transactions" ON wallet_ledger
    FOR INSERT WITH CHECK (true);

-- INVOICES POLICIES
CREATE POLICY "Invoice visibility" ON invoices
    FOR SELECT USING (
        buyer_id = auth.uid() OR  -- Own invoices
        get_user_role() = 'admin' OR  -- Admins see all
        EXISTS (
            SELECT 1 FROM lots l
            JOIN auctions a ON l.auction_id = a.id
            WHERE l.id = lot_id AND is_auctioneer_for_auction(a.id)
        )
    );

CREATE POLICY "Auctioneers update shipping" ON invoices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM lots l
            JOIN auctions a ON l.auction_id = a.id
            WHERE l.id = lot_id AND is_auctioneer_for_auction(a.id)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM lots l
            JOIN auctions a ON l.auction_id = a.id
            WHERE l.id = lot_id AND is_auctioneer_for_auction(a.id)
        )
    );

CREATE POLICY "System can create invoices" ON invoices
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin full access invoices" ON invoices
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- STRIPE EVENTS POLICIES
CREATE POLICY "Admin access to stripe events" ON stripe_events
    FOR ALL USING (get_user_role() = 'admin');

-- PAYOUTS DUE POLICIES
CREATE POLICY "Payout visibility" ON payouts_due
    FOR SELECT USING (
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM auctioneers a
            WHERE a.id = auctioneer_id AND a.user_id = auth.uid()
        )
    );

CREATE POLICY "Admin manages payouts" ON payouts_due
    FOR ALL USING (get_user_role() = 'admin');

-- AUDIT LOG POLICIES
CREATE POLICY "Admin access to audit log" ON audit_log
    FOR SELECT USING (get_user_role() = 'admin');

CREATE POLICY "System can create audit logs" ON audit_log
    FOR INSERT WITH CHECK (true);

-- ==========================================
-- HELPER FUNCTIONS
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

-- Atomic bid placement function with anti-sniping
CREATE OR REPLACE FUNCTION atomic_place_bid(
    lot_uuid UUID,
    bid_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
    auction_record RECORD;
    lot_record RECORD;
    bidder_uuid UUID := auth.uid();
    current_balance INTEGER;
    previous_bid_record RECORD;
    new_balance INTEGER;
    bid_id UUID;
    result JSONB;
BEGIN
    -- Validate user is authenticated
    IF bidder_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

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

    -- Start atomic operations
    BEGIN
        -- Mark all previous bids as not winning
        UPDATE bids SET is_winning = false WHERE lot_id = lot_uuid;

        -- Insert new bid
        INSERT INTO bids (
            lot_id,
            bidder_id,
            amount,
            type,
            is_winning
        ) VALUES (
            lot_uuid,
            bidder_uuid,
            bid_amount,
            'regular',
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

-- Process auction end and create invoices
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

-- Release escrow when item is shipped
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
-- UPDATED_AT TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auctioneers_updated_at BEFORE UPDATE ON auctioneers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auctions_updated_at BEFORE UPDATE ON auctions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lots_updated_at BEFORE UPDATE ON lots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- SEED DATA (commented - enable as needed)
-- ==========================================

/*
-- Create admin user function (call after auth user is created)
CREATE OR REPLACE FUNCTION create_admin_user(user_email TEXT)
RETURNS UUID AS $$
DECLARE
    admin_id UUID;
BEGIN
    -- Insert admin user (assuming auth.users record exists)
    INSERT INTO users (id, email, role, first_name, last_name, is_approved)
    SELECT id, user_email, 'admin', 'System', 'Administrator', true
    FROM auth.users
    WHERE email = user_email
    RETURNING id INTO admin_id;

    RETURN admin_id;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage (uncomment to create admin):
-- SELECT create_admin_user('admin@imaginethisauction.com');
*/