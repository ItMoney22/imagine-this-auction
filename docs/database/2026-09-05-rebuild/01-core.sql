-- Target: Imagine This Auction / lyijpsppmbgjcvzaxhzn. No source data is deleted or imported.
-- Validated in local PostgreSQL. Each migration commits independently for enum compatibility.
create schema if not exists ita_internal;
revoke all on schema ita_internal from public,anon,authenticated;
create table if not exists ita_internal.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());
alter table ita_internal.migrations enable row level security;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='001_initial_schema.sql' and sha256<>'91a11570eb469b3db98d4758636b7178b753443d02e053870e5b0f6a7727fb38') then raise exception 'Migration checksum mismatch: 001_initial_schema.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='001_initial_schema.sql') then
execute $migration$
-- ImagineThisAuction - Initial Database Schema
-- Task B: Schema & Migrations

-- Enable necessary extensions
-- Using gen_random_uuid() which is native to PostgreSQL 13+

-- Create enums
CREATE TYPE user_role AS ENUM ('bidder', 'auctioneer', 'admin');
CREATE TYPE auction_status AS ENUM ('draft', 'scheduled', 'live', 'ended', 'completed');
CREATE TYPE bid_type AS ENUM ('regular', 'proxy');
CREATE TYPE transaction_type AS ENUM ('purchase', 'bid_hold', 'bid_refund', 'escrow_hold', 'escrow_release', 'payout');

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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lot_id UUID REFERENCES lots(id) ON DELETE CASCADE NOT NULL,
    buyer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    hammer_price INTEGER NOT NULL, -- in cents
    buyer_premium_percent DECIMAL(5,2) NOT NULL,
    buyer_premium_amount INTEGER NOT NULL, -- calculated buyer's premium in cents
    total_amount INTEGER NOT NULL, -- hammer_price + buyer_premium_amount
    platform_commission_amount INTEGER DEFAULT 0 NOT NULL, -- platform's cut in cents
    status TEXT DEFAULT 'pending' NOT NULL, -- pending, escrow_hold, completed, refunded
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Add triggers for updated_at timestamps
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

-- Create initial admin user function (will be called by seed script)
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
$migration$;
insert into ita_internal.migrations(name,sha256) values('001_initial_schema.sql','91a11570eb469b3db98d4758636b7178b753443d02e053870e5b0f6a7727fb38');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='002_rls_policies.sql' and sha256<>'ae11e80f671ac7ebe1533e5133dea4c26855f49c77fe39b5fd88aed8034ef0f0') then raise exception 'Migration checksum mismatch: 002_rls_policies.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='002_rls_policies.sql') then
execute $migration$
-- ImagineThisAuction - Row Level Security Policies
-- Task B: Schema & Migrations

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

-- ==========================================
-- USERS TABLE POLICIES
-- ==========================================

-- Users can view their own profile and public info of others
CREATE POLICY "Users can view own profile and public info" ON users
    FOR SELECT USING (
        id = auth.uid() OR  -- Own profile
        get_user_role() = 'admin' OR  -- Admins see all
        (role = 'auctioneer' AND is_approved = true)  -- Approved auctioneers visible publicly
    );

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Only authenticated users can insert (auth callback creates profile)
CREATE POLICY "Authenticated users can create profile" ON users
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==========================================
-- AUCTIONEERS TABLE POLICIES
-- ==========================================

-- Auctioneers can view their own profile, public can view approved ones
CREATE POLICY "Auctioneer profile visibility" ON auctioneers
    FOR SELECT USING (
        user_id = auth.uid() OR  -- Own profile
        get_user_role() = 'admin' OR  -- Admins see all
        is_approved = true  -- Public can see approved auctioneers
    );

-- Auctioneers can update their own profile (except approval status)
CREATE POLICY "Auctioneers can update own profile" ON auctioneers
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can create auctioneer profiles
CREATE POLICY "Users can create auctioneer profile" ON auctioneers
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ==========================================
-- AUCTIONS TABLE POLICIES
-- ==========================================

-- Public can view scheduled/live/ended auctions, auctioneers see own, admins see all
CREATE POLICY "Auction visibility" ON auctions
    FOR SELECT USING (
        status IN ('scheduled', 'live', 'ended', 'completed') OR  -- Public auctions
        get_user_role() = 'admin' OR  -- Admins see all
        is_auctioneer_for_auction(id)  -- Auctioneers see their own
    );

-- Auctioneers can create and update their own auctions
CREATE POLICY "Auctioneers manage own auctions" ON auctions
    FOR ALL USING (is_auctioneer_for_auction(id))
    WITH CHECK (is_auctioneer_for_auction(id));

-- Auctioneers can insert auctions
CREATE POLICY "Auctioneers can create auctions" ON auctions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM auctioneers
            WHERE id = auctioneer_id AND user_id = auth.uid()
        )
    );

-- ==========================================
-- LOTS TABLE POLICIES
-- ==========================================

-- Public can view lots from public auctions
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

-- Auctioneers can manage lots in their auctions
CREATE POLICY "Auctioneers manage own lots" ON lots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auctions a
            WHERE a.id = auction_id AND is_auctioneer_for_auction(a.id)
        )
    );

-- ==========================================
-- BIDS TABLE POLICIES
-- ==========================================

-- Bidders can view their own bids, auctioneers see bids on their lots, public sees winning bids
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

-- Authenticated users can place bids
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

-- ==========================================
-- WALLET LEDGER POLICIES
-- ==========================================

-- Users can only view their own wallet transactions
CREATE POLICY "Users view own wallet" ON wallet_ledger
    FOR SELECT USING (
        user_id = auth.uid() OR
        get_user_role() = 'admin'
    );

-- System can insert wallet transactions (will be done via functions)
CREATE POLICY "System can insert wallet transactions" ON wallet_ledger
    FOR INSERT WITH CHECK (true);

-- ==========================================
-- INVOICES POLICIES
-- ==========================================

-- Buyers can see their own invoices, auctioneers see invoices for their lots
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

-- Auctioneers can update shipping status on their invoices
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

-- System can create invoices
CREATE POLICY "System can create invoices" ON invoices
    FOR INSERT WITH CHECK (true);

-- ==========================================
-- STRIPE EVENTS POLICIES
-- ==========================================

-- Only admins and system can access stripe events
CREATE POLICY "Admin access to stripe events" ON stripe_events
    FOR ALL USING (get_user_role() = 'admin');

-- ==========================================
-- PAYOUTS DUE POLICIES
-- ==========================================

-- Auctioneers can view their own payouts, admins see all
CREATE POLICY "Payout visibility" ON payouts_due
    FOR SELECT USING (
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM auctioneers a
            WHERE a.id = auctioneer_id AND a.user_id = auth.uid()
        )
    );

-- Only system/admin can manage payouts
CREATE POLICY "Admin manages payouts" ON payouts_due
    FOR ALL USING (get_user_role() = 'admin');

-- ==========================================
-- AUDIT LOG POLICIES
-- ==========================================

-- Only admins can view audit logs
CREATE POLICY "Admin access to audit log" ON audit_log
    FOR SELECT USING (get_user_role() = 'admin');

-- System can insert audit logs
CREATE POLICY "System can create audit logs" ON audit_log
    FOR INSERT WITH CHECK (true);

-- ==========================================
-- ADMIN OVERRIDE POLICIES
-- ==========================================

-- Admins have full access to all tables (additional policies)
CREATE POLICY "Admin full access users" ON users
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin full access auctioneers" ON auctioneers
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin full access auctions" ON auctions
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin full access lots" ON lots
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin full access bids" ON bids
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin full access invoices" ON invoices
    FOR ALL USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');
$migration$;
insert into ita_internal.migrations(name,sha256) values('002_rls_policies.sql','ae11e80f671ac7ebe1533e5133dea4c26855f49c77fe39b5fd88aed8034ef0f0');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='003_indexes_functions.sql' and sha256<>'e7b7ef814717c1168741e6d573cd633a93b2a6c7366d24f5cfb66f29d4120f05') then raise exception 'Migration checksum mismatch: 003_indexes_functions.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='003_indexes_functions.sql') then
execute $migration$
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
$migration$;
insert into ita_internal.migrations(name,sha256) values('003_indexes_functions.sql','e7b7ef814717c1168741e6d573cd633a93b2a6c7366d24f5cfb66f29d4120f05');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='004_payment_provider.sql' and sha256<>'b8ea318dd12b4adff9ca91f78d9f4eab436fe3587b59e99ef72fba6ce197ef5d') then raise exception 'Migration checksum mismatch: 004_payment_provider.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='004_payment_provider.sql') then
execute $migration$
-- Migrate legacy Stripe payment tracking to provider-agnostic payment events

ALTER TABLE stripe_events RENAME TO payment_events;

ALTER INDEX idx_stripe_events_processed RENAME TO idx_payment_events_processed;

ALTER TABLE payment_events RENAME COLUMN data TO payload;

ALTER TABLE payment_events
    ADD COLUMN provider TEXT DEFAULT 'legacy-stripe' NOT NULL,
    ADD COLUMN provider_event_id TEXT;

UPDATE payment_events SET provider_event_id = COALESCE(provider_event_id, id);

ALTER TABLE payment_events
    ALTER COLUMN provider_event_id SET NOT NULL;

ALTER TABLE payment_events
    ALTER COLUMN provider SET DEFAULT 'paymentcloud';

ALTER TABLE payment_events
    ALTER COLUMN processed_at SET DEFAULT NULL;

DROP POLICY IF EXISTS "Admin access to stripe events" ON payment_events;
CREATE POLICY "Admin access to payment events" ON payment_events
    FOR ALL USING (get_user_role() = 'admin');

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_event_id
    ON payment_events(provider_event_id);

-- Drop old function to allow parameter rename
DROP FUNCTION IF EXISTS add_wallet_credits(UUID, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION add_wallet_credits(
    user_uuid UUID,
    credit_amount INTEGER,
    provider_event_identifier TEXT,
    purchase_description TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
    event_provider TEXT;
BEGIN
    SELECT provider
    INTO event_provider
    FROM payment_events
    WHERE provider_event_id = provider_event_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    IF event_provider IS NULL THEN
        event_provider := 'paymentcloud';
    END IF;

    current_balance := get_wallet_balance(user_uuid);
    new_balance := current_balance + credit_amount;

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
        NULL,
        'payment_event',
        jsonb_build_object(
            'provider_event_id', provider_event_identifier,
            'provider', event_provider
        )
    );

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

$migration$;
insert into ita_internal.migrations(name,sha256) values('004_payment_provider.sql','b8ea318dd12b4adff9ca91f78d9f4eab436fe3587b59e99ef72fba6ce197ef5d');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='005_admin_support.sql' and sha256<>'e30b63308ff0580f62d29423f802e48062e9885c687e509a8585662da9fcc40d') then raise exception 'Migration checksum mismatch: 005_admin_support.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='005_admin_support.sql') then
execute $migration$
-- Admin Support Migration
-- Creates missing tables, views, and functions for admin endpoints

-- ============================================
-- TABLES
-- ============================================

-- Announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT DEFAULT 'all',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  admin_id UUID REFERENCES public.users(id)
);

-- System announcements (different from above for compatibility)
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'urgent')) DEFAULT 'info',
  target_roles TEXT[] DEFAULT ARRAY['bidder', 'auctioneer', 'admin'],
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- KYC documents table
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  doc_type TEXT NOT NULL,
  url TEXT,
  status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id)
);

-- User documents (different from above for compatibility)
CREATE TABLE IF NOT EXISTS public.user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  document_type TEXT NOT NULL,
  filename TEXT,
  file_url TEXT,
  file_size BIGINT,
  mime_type TEXT,
  verification_status TEXT CHECK (verification_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  verification_notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id)
);

-- Compliance flags table
CREATE TABLE IF NOT EXISTS public.compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  reason TEXT NOT NULL,
  severity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id)
);

-- User compliance flags (different from above for compatibility)
CREATE TABLE IF NOT EXISTS public.user_compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  flag_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  description TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  flagged_by UUID REFERENCES public.users(id),
  resolved_by UUID REFERENCES public.users(id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_announcements_active ON public.system_announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_system_announcements_created ON public.system_announcements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_docs_user ON public.kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_docs_status ON public.kyc_documents(status);

CREATE INDEX IF NOT EXISTS idx_user_docs_user ON public.user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_docs_status ON public.user_documents(verification_status);

CREATE INDEX IF NOT EXISTS idx_compliance_flags_user ON public.compliance_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_flags_created ON public.compliance_flags(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_compliance_flags_user ON public.user_compliance_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_compliance_flags_resolved ON public.user_compliance_flags(is_resolved);
CREATE INDEX IF NOT EXISTS idx_user_compliance_flags_severity ON public.user_compliance_flags(severity);

-- ============================================
-- VIEWS
-- ============================================

-- Financial aggregates view
CREATE OR REPLACE VIEW public.financial_aggregates AS
SELECT
  date_trunc('day', COALESCE(il.created_at, wl.created_at)) as day,
  COALESCE(sum(il.total_amount), 0) as gross_sales,
  COALESCE(sum(il.buyer_premium_amount), 0) as buyers_premium,
  COALESCE(sum(il.platform_commission_amount), 0) as platform_commission,
  COALESCE(sum(CASE WHEN il.status = 'escrow_hold' THEN il.total_amount ELSE 0 END), 0) as escrow_balance,
  count(il.id) as invoice_count,
  count(CASE WHEN il.is_paid THEN 1 END) as paid_invoices
FROM invoices il
FULL OUTER JOIN wallet_ledger wl ON date_trunc('day', il.created_at) = date_trunc('day', wl.created_at)
WHERE il.created_at >= NOW() - INTERVAL '90 days'
   OR wl.created_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Suspicious users view
CREATE OR REPLACE VIEW public.suspicious_users_view AS
SELECT
  u.id as user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.role,
  COALESCE(bid_stats.bid_count_last7d, 0) as bid_count_last7d,
  COALESCE(bid_stats.unique_auctions, 0) as unique_auctions_bid,
  COALESCE(wl_stats.total_negative_balance_events, 0) as credit_issues,
  COALESCE(cf_stats.flags, 0) as compliance_flags,
  COALESCE(inv_stats.failed_payments, 0) as failed_payments,
  -- Calculate risk score
  LEAST(100, (
    COALESCE(bid_stats.bid_count_last7d, 0) * 0.5 +
    COALESCE(wl_stats.total_negative_balance_events, 0) * 5 +
    COALESCE(cf_stats.flags, 0) * 10 +
    COALESCE(inv_stats.failed_payments, 0) * 8
  )) as risk_score,
  u.created_at as account_created
FROM users u
LEFT JOIN (
  SELECT
    bidder_id,
    count(*) as bid_count_last7d,
    count(DISTINCT lot_id) as unique_auctions
  FROM bids
  WHERE created_at >= now() - interval '7 days'
  GROUP BY bidder_id
) bid_stats ON bid_stats.bidder_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    count(*) as total_negative_balance_events
  FROM wallet_ledger
  WHERE amount < 0 AND balance_after < 0
  GROUP BY user_id
) wl_stats ON wl_stats.user_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    count(*) as flags
  FROM compliance_flags
  WHERE resolved_at IS NULL
  GROUP BY user_id
) cf_stats ON cf_stats.user_id = u.id
LEFT JOIN (
  SELECT
    buyer_id,
    count(*) as failed_payments
  FROM invoices
  WHERE is_paid = false AND created_at < now() - interval '7 days'
  GROUP BY buyer_id
) inv_stats ON inv_stats.buyer_id = u.id
WHERE u.role IN ('bidder', 'auctioneer');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Financial summary function
CREATE OR REPLACE FUNCTION public.get_financial_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  total_revenue DECIMAL(12,2);
  total_escrow DECIMAL(12,2);
  pending_payouts DECIMAL(12,2);
  active_auctions INTEGER;
  total_users INTEGER;
BEGIN
  -- Calculate total revenue (from wallet purchases)
  SELECT COALESCE(SUM(amount), 0) / 100.0 INTO total_revenue
  FROM wallet_ledger
  WHERE transaction_type = 'purchase';

  -- Calculate total escrow held
  SELECT COALESCE(SUM(CASE WHEN balance_after > 0 THEN balance_after ELSE 0 END), 0) / 100.0 INTO total_escrow
  FROM wallet_ledger wl1
  WHERE wl1.id = (
    SELECT wl2.id
    FROM wallet_ledger wl2
    WHERE wl2.user_id = wl1.user_id
    ORDER BY wl2.created_at DESC
    LIMIT 1
  );

  -- Calculate pending payouts
  SELECT COALESCE(SUM(amount), 0) / 100.0 INTO pending_payouts
  FROM payouts_due
  WHERE is_paid = false;

  -- Count active auctions
  SELECT COUNT(*) INTO active_auctions
  FROM auctions
  WHERE status = 'live';

  -- Count total users
  SELECT COUNT(*) INTO total_users
  FROM users;

  -- Build result
  result := json_build_object(
    'total_revenue', total_revenue,
    'total_escrow', total_escrow,
    'pending_payouts', pending_payouts,
    'active_auctions', active_auctions,
    'total_users', total_users,
    'platform_commission', total_revenue * 0.012,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

-- Suspicious users detection function
CREATE OR REPLACE FUNCTION public.detect_suspicious_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  risk_score NUMERIC,
  flags TEXT[],
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sv.user_id,
    sv.email,
    sv.first_name,
    sv.last_name,
    sv.risk_score,
    ARRAY[
      CASE WHEN sv.bid_count_last7d > 50 THEN 'high_bidding_activity' END,
      CASE WHEN sv.credit_issues > 3 THEN 'frequent_credit_issues' END,
      CASE WHEN sv.compliance_flags > 0 THEN 'has_compliance_flags' END,
      CASE WHEN sv.failed_payments > 2 THEN 'payment_failures' END
    ]::TEXT[] as flags,
    (
      SELECT MAX(created_at)
      FROM (
        SELECT created_at FROM bids WHERE bidder_id = sv.user_id
        UNION ALL
        SELECT created_at FROM wallet_ledger WHERE user_id = sv.user_id
      ) activities
    ) as last_activity
  FROM suspicious_users_view sv
  WHERE sv.risk_score > 15
  ORDER BY sv.risk_score DESC;
END;
$$;

-- Admin action logging function
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_before_values JSONB DEFAULT NULL,
  p_after_values JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO audit_log (
    id,
    admin_id,
    action,
    target_type,
    target_id,
    before_values,
    after_values,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_admin_id,
    p_action,
    p_target_type,
    p_target_id,
    p_before_values,
    p_after_values,
    now()
  ) RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_compliance_flags ENABLE ROW LEVEL SECURITY;

-- Announcements policies
CREATE POLICY "Users can view active announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- System announcements policies
CREATE POLICY "Users can view active system announcements" ON public.system_announcements
  FOR SELECT TO authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Admins can manage system announcements" ON public.system_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- KYC documents policies
CREATE POLICY "Users can view own kyc documents" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all kyc documents" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- User documents policies
CREATE POLICY "Users can view own documents" ON public.user_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all documents" ON public.user_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Compliance flags policies
CREATE POLICY "Admins can manage compliance flags" ON public.compliance_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage user compliance flags" ON public.user_compliance_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_announcements_updated_at
  BEFORE UPDATE ON public.system_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
$migration$;
insert into ita_internal.migrations(name,sha256) values('005_admin_support.sql','e30b63308ff0580f62d29423f802e48062e9885c687e509a8585662da9fcc40d');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='006_notifications.sql' and sha256<>'85c5c643c9f1f497824c27e56f8e889ec30e0517083dfa7a7a8d96a1ac993ef6') then raise exception 'Migration checksum mismatch: 006_notifications.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='006_notifications.sql') then
execute $migration$
-- Notifications & Missing Columns Migration
-- Creates the tables referenced by the notification subsystem
-- and adds missing columns to users and lots tables.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}';

ALTER TABLE public.lots
ADD COLUMN IF NOT EXISTS hype_copy TEXT;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'system',
  is_read BOOLEAN DEFAULT false,
  batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  last_used TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_roles TEXT[] DEFAULT '{}',
  severity TEXT CHECK (severity IN ('info', 'warning', 'urgent')) DEFAULT 'info',
  sent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name TEXT UNIQUE NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_batch ON public.notifications(batch_id);

CREATE INDEX IF NOT EXISTS idx_user_interests_user ON public.user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_category ON public.user_interests(category);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user ON public.user_device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_endpoint ON public.user_device_tokens(endpoint);

CREATE INDEX IF NOT EXISTS idx_notification_batches_created ON public.notification_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON public.feature_flags(flag_name);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view own interests" ON public.user_interests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own interests" ON public.user_interests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own interests" ON public.user_interests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own interests" ON public.user_interests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all interests" ON public.user_interests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view own device tokens" ON public.user_device_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own device tokens" ON public.user_device_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own device tokens" ON public.user_device_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own device tokens" ON public.user_device_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all device tokens" ON public.user_device_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage notification batches" ON public.notification_batches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can read feature flags" ON public.feature_flags
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage feature flags" ON public.feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.feature_flags (flag_name, is_enabled, description) VALUES
  ('push_notifications', false, 'Enable web push notification delivery'),
  ('email_notifications', false, 'Enable email notification delivery'),
  ('ai_copywriter', false, 'Enable AI-generated marketing copy for lots'),
  ('daily_recommendations', false, 'Enable daily recommendation emails')
ON CONFLICT (flag_name) DO NOTHING;

GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.user_interests TO service_role;
GRANT ALL ON public.user_device_tokens TO service_role;
GRANT ALL ON public.notification_batches TO service_role;
GRANT ALL ON public.feature_flags TO service_role;

$migration$;
insert into ita_internal.migrations(name,sha256) values('006_notifications.sql','85c5c643c9f1f497824c27e56f8e889ec30e0517083dfa7a7a8d96a1ac993ef6');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='007_ai_assistant.sql' and sha256<>'86ad68de6b59484dc30397af18aa2579adb00b23a337d62b5e029a981f6a3334') then raise exception 'Migration checksum mismatch: 007_ai_assistant.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='007_ai_assistant.sql') then
execute $migration$
ALTER TABLE auctioneers
ADD COLUMN IF NOT EXISTS ai_preferences JSONB DEFAULT NULL;

ALTER TABLE lots
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

$migration$;
insert into ita_internal.migrations(name,sha256) values('007_ai_assistant.sql','86ad68de6b59484dc30397af18aa2579adb00b23a337d62b5e029a981f6a3334');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='008_notifications_and_missing_columns.sql' and sha256<>'0f031264238ddf2a7d826d3e22d7c2a1988f86d48ab3c96e236a42058bd8ec94') then raise exception 'Migration checksum mismatch: 008_notifications_and_missing_columns.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='008_notifications_and_missing_columns.sql') then
execute $migration$
-- Compatibility no-op.
-- Notification tables and missing columns are now created in 006_notifications.sql
-- so fresh environments apply them in the correct order without duplicate policy errors.

$migration$;
insert into ita_internal.migrations(name,sha256) values('008_notifications_and_missing_columns.sql','0f031264238ddf2a7d826d3e22d7c2a1988f86d48ab3c96e236a42058bd8ec94');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='009_auctioneer_license_verification.sql' and sha256<>'8c90d1b7f2cf86f7fe48eb39c71b7096b1a1405946f67aedd84650ccbce4379d') then raise exception 'Migration checksum mismatch: 009_auctioneer_license_verification.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='009_auctioneer_license_verification.sql') then
execute $migration$
-- Auctioneer license verification support

CREATE TABLE IF NOT EXISTS public.user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  verification_status TEXT CHECK (verification_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  verification_notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_docs_user ON public.user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_docs_type_status ON public.user_documents(document_type, verification_status);

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own documents" ON public.user_documents;
CREATE POLICY "Users can view own documents" ON public.user_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all documents" ON public.user_documents;
CREATE POLICY "Admins can manage all documents" ON public.user_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'auctioneer-licenses',
  'auctioneer-licenses',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

$migration$;
insert into ita_internal.migrations(name,sha256) values('009_auctioneer_license_verification.sql','8c90d1b7f2cf86f7fe48eb39c71b7096b1a1405946f67aedd84650ccbce4379d');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='010_engagement_features.sql' and sha256<>'f006a72f508b616d3278521143788acafb07e32356b3338924bad013e6eed120') then raise exception 'Migration checksum mismatch: 010_engagement_features.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='010_engagement_features.sql') then
execute $migration$
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

$migration$;
insert into ita_internal.migrations(name,sha256) values('010_engagement_features.sql','f006a72f508b616d3278521143788acafb07e32356b3338924bad013e6eed120');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='011_outbid_notifications_and_ar.sql' and sha256<>'4e53de486e6f0e191b2f2b5bd9d7a9c57c773d183995b72bdfb537ef6e121db8') then raise exception 'Migration checksum mismatch: 011_outbid_notifications_and_ar.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='011_outbid_notifications_and_ar.sql') then
execute $migration$
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

$migration$;
insert into ita_internal.migrations(name,sha256) values('011_outbid_notifications_and_ar.sql','4e53de486e6f0e191b2f2b5bd9d7a9c57c773d183995b72bdfb537ef6e121db8');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='012_watchlist_alerts_and_storage.sql' and sha256<>'034701a04234c6d61a55374c5356c88b0fcdfd2a239ce556f4f9383dfa383a18') then raise exception 'Migration checksum mismatch: 012_watchlist_alerts_and_storage.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='012_watchlist_alerts_and_storage.sql') then
execute $migration$
-- ============================================================
-- Watchlist alerts (1h / 15m / 1m before lot ends)
-- ============================================================

-- Dedupe table so each alert window fires at most once per (user, lot, window).
CREATE TABLE IF NOT EXISTS public.watchlist_alerts_sent (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  window_label TEXT NOT NULL CHECK (window_label IN ('1h','15m','1m')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, lot_id, window_label)
);
CREATE INDEX IF NOT EXISTS idx_wl_alerts_sent_lot ON public.watchlist_alerts_sent(lot_id);

-- Function: scan watched lots ending soon, insert notifications, mark sent.
CREATE OR REPLACE FUNCTION public.send_watchlist_ending_alerts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_window TEXT;
  v_lower INTERVAL;
  v_upper INTERVAL;
  v_label TEXT;
  v_row RECORD;
BEGIN
  FOR v_window IN SELECT unnest(ARRAY['1h','15m','1m'])
  LOOP
    IF v_window = '1h' THEN
      v_lower := INTERVAL '59 minutes';
      v_upper := INTERVAL '60 minutes';
      v_label := 'in 1 hour';
    ELSIF v_window = '15m' THEN
      v_lower := INTERVAL '14 minutes';
      v_upper := INTERVAL '15 minutes';
      v_label := 'in 15 minutes';
    ELSE
      v_lower := INTERVAL '0 minutes';
      v_upper := INTERVAL '1 minute';
      v_label := 'in under a minute';
    END IF;

    FOR v_row IN
      SELECT
        w.user_id,
        w.lot_id,
        l.title AS lot_title,
        a.ends_at
      FROM public.watchlists w
      JOIN public.lots l ON l.id = w.lot_id
      JOIN public.auctions a ON a.id = l.auction_id
      LEFT JOIN public.watchlist_alerts_sent s
        ON s.user_id = w.user_id AND s.lot_id = w.lot_id AND s.window_label = v_window
      WHERE s.user_id IS NULL
        AND a.ends_at > NOW()
        AND a.ends_at - NOW() <= v_upper
        AND a.ends_at - NOW() > v_lower
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        v_row.user_id,
        'Ending ' || v_label || ': ' || v_row.lot_title,
        'A lot you''re watching ends ' || v_label || '. Tap to bid.',
        'watchlist_ending'
      );
      INSERT INTO public.watchlist_alerts_sent (user_id, lot_id, window_label)
      VALUES (v_row.user_id, v_row.lot_id, v_window);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.send_watchlist_ending_alerts() TO authenticated;

-- Schedule every minute (requires pg_cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'send-watchlist-alerts';

    PERFORM cron.schedule(
      'send-watchlist-alerts',
      '* * * * *',
      $cron$ SELECT public.send_watchlist_ending_alerts(); $cron$
    );
  END IF;
END $$;

-- ============================================================
-- Add display_in_leaderboard opt-in flag for Whales board
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_in_leaderboard BOOLEAN DEFAULT false;

$migration$;
insert into ita_internal.migrations(name,sha256) values('012_watchlist_alerts_and_storage.sql','034701a04234c6d61a55374c5356c88b0fcdfd2a239ce556f4f9383dfa383a18');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='013_security_hardening.sql' and sha256<>'7ac43cf14aca36a8c1199f26056c3d87ca3f930415c899f4ffc09835b5d046ce') then raise exception 'Migration checksum mismatch: 013_security_hardening.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='013_security_hardening.sql') then
execute $migration$
-- 013_security_hardening.sql
-- Fixes critical RLS gaps found in the 2026-08-12 launch-readiness sweep.
-- Verified against the live database (project qdiodkevkacgbfvplafm) before writing.
--
-- Context: all legitimate writes to these tables happen through SECURITY DEFINER
-- functions (place_bid, add_wallet_credits, process_auction_end,
-- release_escrow_on_shipping) or the service-role client, both of which are
-- unaffected by these policies. The policies below only close the door on
-- ordinary authenticated users writing directly.

-- 1. wallet_ledger: "WITH CHECK (true)" let ANY authenticated user insert
--    arbitrary ledger rows — i.e. mint themselves credits.
DROP POLICY IF EXISTS "System can insert wallet transactions" ON public.wallet_ledger;
CREATE POLICY "Admins insert wallet transactions" ON public.wallet_ledger
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- 2. invoices: same hole — any user could forge invoices.
DROP POLICY IF EXISTS "System can create invoices" ON public.invoices;
CREATE POLICY "Admins create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- 3. audit_log: any user could forge audit entries.
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_log;
CREATE POLICY "Admins create audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- 4. watchlists: public SELECT (true) exposed every user's watchlist
--    (user_id + lot_id pairs). The only public consumer was the aggregate
--    count endpoint, which now uses the service-role client instead
--    (app/api/watchlist/[lotId]/count/route.ts).
DROP POLICY IF EXISTS "Public read watchlist counts" ON public.watchlists;

-- 5. watchlist_alerts_sent: RLS was never enabled — default grants made it
--    readable/writable by any authenticated user. The nightly alert function
--    is SECURITY DEFINER, so enabling RLS with no policies (deny-all) is safe.
ALTER TABLE public.watchlist_alerts_sent ENABLE ROW LEVEL SECURITY;

-- 6. Views run with owner privileges by default (RLS bypass): any
--    authenticated user could read platform financials and other users'
--    emails/risk scores. security_invoker makes them respect the caller's RLS;
--    the admin API routes use the service role, so they keep working.
ALTER VIEW public.financial_aggregates SET (security_invoker = true);
ALTER VIEW public.suspicious_users_view SET (security_invoker = true);

$migration$;
insert into ita_internal.migrations(name,sha256) values('013_security_hardening.sql','7ac43cf14aca36a8c1199f26056c3d87ca3f930415c899f4ffc09835b5d046ce');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='014_notification_delivery.sql' and sha256<>'33e06b2a5b245ade39bdd3c5a0b03d1e2282eef83d3cad86d51a4692d1dec2af') then raise exception 'Migration checksum mismatch: 014_notification_delivery.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='014_notification_delivery.sql') then
execute $migration$
-- 014_notification_delivery.sql
-- Delivery tracking for the notification pipeline (2026-08-12 rewrite).
-- The delivery routes mark each notification when its email/push has been
-- sent; NULL means "not yet delivered" and is retried on the next batch run.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_email_unsent
  ON public.notifications (created_at)
  WHERE email_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_push_unsent
  ON public.notifications (created_at)
  WHERE push_sent_at IS NULL;

-- Email domain (imaginethisauction.com) verified in Resend 2026-08-12 —
-- email delivery can go live. Push stays off until VAPID keys are configured.
UPDATE public.feature_flags SET is_enabled = true WHERE flag_name = 'email_notifications';

$migration$;
insert into ita_internal.migrations(name,sha256) values('014_notification_delivery.sql','33e06b2a5b245ade39bdd3c5a0b03d1e2282eef83d3cad86d51a4692d1dec2af');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='015_ai_quick_listing_enums.sql' and sha256<>'676d58f44aa966831cdde7f591b43eb40b15747fb05ea7e96b5e7b50cd35d7c4') then raise exception 'Migration checksum mismatch: 015_ai_quick_listing_enums.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='015_ai_quick_listing_enums.sql') then
execute $migration$
-- 015_ai_quick_listing_enums.sql
-- Enum values for the AI Quick Listing & Product Presentation feature.
--
-- This is deliberately a SEPARATE migration from 016. PostgreSQL allows
-- `ALTER TYPE ... ADD VALUE` inside a transaction (PG 12+), but the new value
-- cannot be *used* by other statements in that same transaction. Splitting the
-- enum change out means 016 can reference 'ai_spend'/'ai_refund' freely.
--
-- Run 015 first, then 016.

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ai_spend';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'ai_refund';

$migration$;
insert into ita_internal.migrations(name,sha256) values('015_ai_quick_listing_enums.sql','676d58f44aa966831cdde7f591b43eb40b15747fb05ea7e96b5e7b50cd35d7c4');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='016_ai_quick_listing.sql' and sha256<>'949471a2d6d9e59c9d095042c9b988aadd9f94d78d36e3a79722f3dc8665ae7f') then raise exception 'Migration checksum mismatch: 016_ai_quick_listing.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='016_ai_quick_listing.sql') then
execute $migration$
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

$migration$;
insert into ita_internal.migrations(name,sha256) values('016_ai_quick_listing.sql','949471a2d6d9e59c9d095042c9b988aadd9f94d78d36e3a79722f3dc8665ae7f');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='017_local_delivery_step1_enum.sql' and sha256<>'26e4b162c5445a0ba0d2f986ff0b8c3a108ef45b229ce5a2674cdf480054425e') then raise exception 'Migration checksum mismatch: 017_local_delivery_step1_enum.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='017_local_delivery_step1_enum.sql') then
execute $migration$
-- 017_local_delivery_step1_enum.sql
-- Local Delivery tracking — STEP 1 of 2.
-- Enum additions must commit before any migration references the new value,
-- so this file runs alone, BEFORE step 2.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver';

$migration$;
insert into ita_internal.migrations(name,sha256) values('017_local_delivery_step1_enum.sql','26e4b162c5445a0ba0d2f986ff0b8c3a108ef45b229ce5a2674cdf480054425e');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='018_local_delivery_step2_schema.sql' and sha256<>'a4a64ad4f9cd716063775ef70f754f109ee3122966638ab0d83574df7eaecb25') then raise exception 'Migration checksum mismatch: 018_local_delivery_step2_schema.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='018_local_delivery_step2_schema.sql') then
execute $migration$
-- 018_local_delivery_step2_schema.sql
-- Local Delivery tracking — STEP 2 of 2. Run AFTER step 1 (driver enum value).
-- Design: docs/plans/2026-08-12-local-delivery-tracking-design.md

-- ─── Drivers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  vehicle_type TEXT,
  phone TEXT,
  notes TEXT,
  -- Explicit location-tracking consent. NULL = not granted. Pings are refused
  -- server-side unless this is set; drivers can revoke at any time.
  location_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Deliveries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES public.lots(id),
  customer_user_id UUID NOT NULL REFERENCES public.users(id),
  auctioneer_id UUID REFERENCES public.auctioneers(id),
  tracking_number TEXT NOT NULL UNIQUE,
  -- Secret for the customer tracking link (unguessable, revocable by rotation)
  tracking_token TEXT NOT NULL UNIQUE,
  package_barcode TEXT NOT NULL,
  weight_g INTEGER,
  length_mm INTEGER,
  width_mm INTEGER,
  height_mm INTEGER,
  pickup_address JSONB,
  dropoff_address JSONB,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'offered', 'claimed', 'arrived', 'picked_up',
    'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled', 'failed'
  )),
  driver_id UUID REFERENCES public.drivers(id),
  offer_expires_at TIMESTAMPTZ,
  eta_window_start TIMESTAMPTZ,
  eta_window_end TIMESTAMPTZ,
  signature_required BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ,
  recipient_name TEXT,
  delivery_notes TEXT,
  proof_photo_path TEXT,
  signature_path TEXT,
  delivered_lat DOUBLE PRECISION,
  delivered_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON public.deliveries (driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON public.deliveries (customer_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_barcode ON public.deliveries (package_barcode);

-- ─── Event timeline (append-only audit trail) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.users(id),
  actor_role TEXT,
  notes TEXT,
  photo_path TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery
  ON public.delivery_events (delivery_id, created_at);

-- ─── Offers to drivers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'declined', 'expired', 'claimed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (delivery_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_offers_driver ON public.delivery_offers (driver_id, status);

-- ─── Location pings (only while actively on a delivery, with consent) ───────
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_delivery
  ON public.driver_locations (delivery_id, recorded_at);

-- ─── Invoices: fulfillment method ───────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fulfillment_method TEXT NOT NULL DEFAULT 'shipping';
DO $$
BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_fulfillment_method_check
    CHECK (fulfillment_method IN ('shipping', 'local_delivery'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── updated_at triggers ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_drivers_updated_at ON public.drivers;
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_deliveries_updated_at ON public.deliveries;
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- All writes go through service-role API routes (which bypass RLS). Policies
-- below grant only the reads each role needs (also powers Realtime).
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage drivers" ON public.drivers;
CREATE POLICY "Admins manage drivers" ON public.drivers
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read own profile" ON public.drivers;
CREATE POLICY "Drivers read own profile" ON public.drivers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read deliveries" ON public.deliveries;
CREATE POLICY "Admins read deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read assigned deliveries" ON public.deliveries;
CREATE POLICY "Drivers read assigned deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Buyers read own deliveries" ON public.deliveries;
CREATE POLICY "Buyers read own deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (customer_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read delivery events" ON public.delivery_events;
CREATE POLICY "Admins read delivery events" ON public.delivery_events
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read events for assigned deliveries" ON public.delivery_events;
CREATE POLICY "Drivers read events for assigned deliveries" ON public.delivery_events
  FOR SELECT TO authenticated USING (
    delivery_id IN (
      SELECT d.id FROM public.deliveries d
      JOIN public.drivers dr ON dr.id = d.driver_id
      WHERE dr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read offers" ON public.delivery_offers;
CREATE POLICY "Admins read offers" ON public.delivery_offers
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read own offers" ON public.delivery_offers;
CREATE POLICY "Drivers read own offers" ON public.delivery_offers
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins read driver locations" ON public.driver_locations;
CREATE POLICY "Admins read driver locations" ON public.driver_locations
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read own locations" ON public.driver_locations;
CREATE POLICY "Drivers read own locations" ON public.driver_locations
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Storage bucket for proof photos / signatures (private) ─────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-proofs', 'delivery-proofs', false)
ON CONFLICT (id) DO NOTHING;

$migration$;
insert into ita_internal.migrations(name,sha256) values('018_local_delivery_step2_schema.sql','a4a64ad4f9cd716063775ef70f754f109ee3122966638ab0d83574df7eaecb25');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='019_security_hardening_2.sql' and sha256<>'8754de48738aacec321375c97a5c7c01da2ece2d4be48579d307b54207875915') then raise exception 'Migration checksum mismatch: 019_security_hardening_2.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='019_security_hardening_2.sql') then
execute $migration$
-- 019_security_hardening_2.sql
-- Closes the privilege-escalation holes confirmed on the LIVE database
-- (project qdiodkevkacgbfvplafm, pg_policies + column_privileges) in the
-- 2026-09-04 launch audit. Run after 001-002 (requires get_user_role and the
-- base tables); safe to run before or after 013-018. Idempotent: safe to re-run.
--
-- What was wrong:
--   1. The users UPDATE policy is just `id = auth.uid()` and the `authenticated`
--      role holds column UPDATE on users.role / users.is_approved, so any
--      logged-in user can PATCH themselves to admin through PostgREST.
--      Same shape on auctioneers.is_approved / approval_date.
--   2. The users INSERT policy is `auth.uid() IS NOT NULL` with no role check,
--      so a fresh sign-up whose profile row does not exist yet can insert one
--      with role = 'admin'.
--   3. app/api/admin/users/[id]/{role,status} call change_user_role /
--      change_user_status, which do not exist in the live DB.
--   4. log_admin_action (005) inserts columns audit_log does not have, so it
--      throws on every call.
--   5. The private auctioneer-licenses bucket has no storage.objects policies.
--
-- Every legitimate writer of the privileged columns goes through the
-- service-role client (app/api/auctioneer/apply, app/api/admin/auctioneers/
-- [id]/status, app/api/admin/drivers) or the admin-only RPCs below, none of
-- which are affected by the grants or the triggers. Ordinary profile edits
-- (first_name, phone, notification_prefs, auctioneers.ai_preferences, ...)
-- keep working: those columns are re-granted explicitly.

-- ============================================================
-- 0. Who is allowed to touch privileged columns?
-- ============================================================

-- Role claim of the JWT PostgREST attached to this request:
--   'service_role'  service-role key (server code)
--   'authenticated' user session
--   'anon'          anon key, no session
--   ''              no JWT at all: SQL editor, pg_cron, direct psql
-- Same GUCs auth.uid()/auth.role() read; inlined so this does not depend on
-- the deprecated auth.role() wrapper.
CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
$$;

-- TRUE for the service role, for sessions that did not arrive through
-- PostgREST (SQL editor, psql, pg_cron: anything whose login role is not
-- `authenticator`), and for signed-in admins (same get_user_role() primitive
-- the RLS policies use). A PostgREST request with no role claim is NOT
-- privileged: session_user is the login role, so it stays `authenticator`
-- whatever role PostgREST SET ROLEs to for the request.
-- Always returns a non-null boolean so `IF NOT ...` guards are safe.
CREATE OR REPLACE FUNCTION public.is_admin_or_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.request_jwt_role() = 'service_role'
      OR session_user <> 'authenticator'
      OR COALESCE(
           auth.uid() IS NOT NULL AND public.get_user_role() = 'admin'::public.user_role,
           false
         );
$$;

-- Both helpers are only called from the SECURITY DEFINER bodies and triggers
-- below, which run as their owner, so no client role needs to EXECUTE them
-- directly. Keeps them off the PostgREST RPC surface.
REVOKE EXECUTE ON FUNCTION public.request_jwt_role(), public.is_admin_or_service_role()
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 1. Column-level UPDATE grants
-- ============================================================
-- A column-level REVOKE does not remove a table-level GRANT, and the live DB
-- has table-level UPDATE granted to authenticated/anon on both tables. So:
-- revoke the table-level privilege, then grant UPDATE back column by column
-- on everything that is NOT privileged. The column list is read from the live
-- catalog so a column added outside these migration files keeps working
-- (status quo for it: it was already updatable); the NOTICE shows exactly
-- what was granted.
--
-- users:       privileged = id, role, is_approved, created_at,
--                           terms_accepted_at (server-stamped; skipped if absent)
--              expected grant = email, first_name, last_name, phone,
--                               notification_prefs (006),
--                               display_in_leaderboard (012), updated_at
-- auctioneers: privileged = id, user_id, is_approved, approval_date, created_at
--              expected grant = company_name, business_license, tax_id,
--                               address_line1, address_line2, city, state,
--                               zip_code, website, logo_url,
--                               ai_preferences (007), updated_at
--
-- New columns on these tables get NO user UPDATE until a migration grants it:
--   GRANT UPDATE (col) ON public.users TO authenticated;
-- This file grants what exists when it runs; anything added afterwards starts
-- locked, which is the safe default.

REVOKE UPDATE ON public.users FROM authenticated, anon;
REVOKE UPDATE ON public.auctioneers FROM authenticated, anon;

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name NOT IN ('id', 'role', 'is_approved', 'created_at', 'terms_accepted_at');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'public.users has no grantable columns?!';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.users TO authenticated', v_cols);
  RAISE NOTICE 'users: authenticated may UPDATE (%)', v_cols;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'auctioneers'
    AND column_name NOT IN ('id', 'user_id', 'is_approved', 'approval_date', 'created_at');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'public.auctioneers has no grantable columns?!';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.auctioneers TO authenticated', v_cols);
  RAISE NOTICE 'auctioneers: authenticated may UPDATE (%)', v_cols;
END $$;

-- ============================================================
-- 2. Triggers: belt and suspenders for the grants above
-- ============================================================
-- Generic BEFORE UPDATE guard. The protected column names are passed as
-- trigger arguments, so one function serves both tables. Raises
-- insufficient_privilege (42501) unless the caller is an admin or the
-- service role. SECURITY DEFINER so it works regardless of who fires it;
-- auth.uid() and the JWT GUCs are session settings and still describe the
-- real caller inside a definer function.
CREATE OR REPLACE FUNCTION public.protect_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_col TEXT;
  v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF public.is_admin_or_service_role() THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    -- A misspelled trigger argument would otherwise protect nothing, silently.
    IF NOT (v_old ? v_col) THEN
      RAISE EXCEPTION 'protect_privileged_columns: %.% has no column %',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, v_col;
    END IF;
    IF v_new -> v_col IS DISTINCT FROM v_old -> v_col THEN
      v_changed := array_append(v_changed, v_col);
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = format(
        '%I.%I: only an admin can change %s',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, array_to_string(v_changed, ', ')
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_users_privileged_columns ON public.users;
CREATE TRIGGER protect_users_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_columns('role', 'is_approved');

DROP TRIGGER IF EXISTS protect_auctioneers_privileged_columns ON public.auctioneers;
CREATE TRIGGER protect_auctioneers_privileged_columns
  BEFORE UPDATE ON public.auctioneers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_columns('is_approved', 'approval_date');

-- Same class of hole on INSERT: app/auth/callback creates the profile row
-- from the user's own session (role 'bidder', is_approved true — bidders are
-- auto-approved). Nothing else inserts into users from a user session, so a
-- non-privileged insert must be the caller's own row and must be a bidder.
CREATE OR REPLACE FUNCTION public.protect_users_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin_or_service_role() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'public.users: you can only create your own profile';
  END IF;

  IF NEW.role IS DISTINCT FROM 'bidder'::public.user_role THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'public.users: self-created profiles must have role bidder';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_users_insert ON public.users;
CREATE TRIGGER protect_users_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_users_insert();

-- ============================================================
-- 3. log_admin_action: write the columns audit_log actually has
-- ============================================================
-- audit_log (001): user_id, action, table_name, record_id, old_values,
-- new_values, ip_address, user_agent, created_at.
-- Callers: app/api/admin/announcements/[id] (session client, 6 named params),
-- app/api/admin/auctioneers/[id]/status (service role, adds p_notes), and the
-- RPCs below. The actor recorded is the real JWT subject when there is one,
-- so an admin cannot attribute an action to someone else; the service role
-- (no subject) records the id the server passes in.
DROP FUNCTION IF EXISTS public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_before_values JSONB DEFAULT NULL,
  p_after_values JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id UUID;
  v_after JSONB := p_after_values;
BEGIN
  IF NOT public.is_admin_or_service_role() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Admin access required';
  END IF;

  IF p_notes IS NOT NULL AND btrim(p_notes) <> '' THEN
    v_after := COALESCE(v_after, '{}'::jsonb) || jsonb_build_object('notes', p_notes);
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    COALESCE(auth.uid(), p_admin_id),
    p_action,
    COALESCE(NULLIF(btrim(p_target_type), ''), 'system'),
    p_target_id,
    p_before_values,
    v_after
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) TO authenticated, service_role;

-- ============================================================
-- 4. Admin RPCs the routes already call
-- ============================================================
-- Parameter names and return shapes match app/api/admin/users/[id]/role and
-- .../status exactly. Bodies adapted from 20240101000005_admin_audit_system
-- .sql.disabled with the audit call fixed and an admin guard added: the
-- routes call these through the user's session, so PostgREST exposes them to
-- every authenticated user and the function itself must refuse non-admins.

CREATE OR REPLACE FUNCTION public.change_user_role(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_new_role public.user_role,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_old_role public.user_role;
  v_email TEXT;
BEGIN
  IF NOT public.is_admin_or_service_role() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Admin access required';
  END IF;

  v_actor := COALESCE(auth.uid(), p_admin_id);

  IF v_actor = p_target_user_id AND p_new_role <> 'admin'::public.user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove admin role from yourself');
  END IF;

  SELECT role, email INTO v_old_role, v_email
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_old_role = p_new_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already has this role');
  END IF;

  UPDATE public.users
  SET role = p_new_role, updated_at = timezone('utc'::text, now())
  WHERE id = p_target_user_id;

  PERFORM public.log_admin_action(
    v_actor,
    'role_change',
    'users',
    p_target_user_id,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_new_role),
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_role', v_old_role,
    'new_role', p_new_role,
    'user_email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_user_role(UUID, UUID, public.user_role, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_user_role(UUID, UUID, public.user_role, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_user_status(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_is_approved BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_old_status BOOLEAN;
  v_email TEXT;
  v_action TEXT;
BEGIN
  IF NOT public.is_admin_or_service_role() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Admin access required';
  END IF;

  v_actor := COALESCE(auth.uid(), p_admin_id);

  IF v_actor = p_target_user_id AND NOT p_is_approved THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot suspend your own account');
  END IF;

  SELECT is_approved, email INTO v_old_status, v_email
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_old_status = p_is_approved THEN
    RETURN jsonb_build_object('success', false, 'error', 'User status unchanged');
  END IF;

  UPDATE public.users
  SET is_approved = p_is_approved, updated_at = timezone('utc'::text, now())
  WHERE id = p_target_user_id;

  v_action := CASE WHEN p_is_approved THEN 'user_unsuspended' ELSE 'user_suspended' END;

  PERFORM public.log_admin_action(
    v_actor,
    v_action,
    'users',
    p_target_user_id,
    jsonb_build_object('is_approved', v_old_status),
    jsonb_build_object('is_approved', p_is_approved),
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_old_status,
    'new_status', p_is_approved,
    'user_email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_user_status(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_user_status(UUID, UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- ============================================================
-- 5. Storage: auctioneer-licenses bucket policies
-- ============================================================
-- Bucket created in 009 (private, 10 MB, pdf/jpeg/png/webp). Uploads go
-- through the service role (app/api/auctioneer/apply) under
-- `<user_id>/<file>`, and admins read through a signed URL from the service
-- role too — so today no policy is strictly required for the app to work.
-- These make the intent explicit and cover any direct client access:
-- owner may read their own folder, admins may do anything.
--
-- storage.objects is owned by supabase_storage_admin, so policy creation can
-- be refused depending on the role running the migration (same wrapper as
-- 016). A refusal is logged rather than failing the rest of this migration.
-- The bucket upsert sits inside the same guard: storage.buckets has the same
-- owner, so an insufficient_privilege there must not abort the file either
-- (the bucket already exists on the live DB from 009).
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('auctioneer-licenses', 'auctioneer-licenses', false)
  ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS "Auctioneers read own license files" ON storage.objects;
  CREATE POLICY "Auctioneers read own license files" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'auctioneer-licenses'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "Admins manage license files" ON storage.objects;
  CREATE POLICY "Admins manage license files" ON storage.objects
    FOR ALL TO authenticated
    USING (
      bucket_id = 'auctioneer-licenses'
      AND public.get_user_role() = 'admin'::public.user_role
    )
    WITH CHECK (
      bucket_id = 'auctioneer-licenses'
      AND public.get_user_role() = 'admin'::public.user_role
    );
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Skipped storage.objects policies for auctioneer-licenses (insufficient privilege). Create them from Storage > Policies in the dashboard: owner SELECT where (storage.foldername(name))[1] = auth.uid()::text; admin ALL where get_user_role() = ''admin''.';
END $$;

-- ============================================================
-- 6. Tell PostgREST about the new/changed functions
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification (the SQL editor shows this result set)
-- ============================================================
-- Every row should read ok = true. A false on a "cannot UPDATE" row means
-- the table-level grant came from a grantor other than the role running this
-- file (REVOKE only removes your own grants) — the triggers in section 2
-- still block the change, but investigate. A false on a storage row means
-- the policies were skipped for lack of privilege; add them from the
-- dashboard (see the NOTICE text in section 5). Rows 22/23 inline the column
-- lists actually granted (the SQL editor does not show section 1's NOTICEs):
-- read them and confirm no privileged column is present.
WITH granted AS (
  SELECT table_name::text AS table_name,
         string_agg(column_name::text, ', ' ORDER BY column_name::text) AS cols
  FROM information_schema.column_privileges
  WHERE grantee = 'authenticated'
    AND table_schema = 'public'
    AND table_name IN ('users', 'auctioneers')
    AND privilege_type = 'UPDATE'
  GROUP BY table_name
)
SELECT check_name, ok
FROM (VALUES
  (10, 'authenticated cannot UPDATE users.role',
       NOT has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')),
  (11, 'authenticated cannot UPDATE users.is_approved',
       NOT has_column_privilege('authenticated', 'public.users', 'is_approved', 'UPDATE')),
  (12, 'anon cannot UPDATE users at all',
       NOT has_table_privilege('anon', 'public.users', 'UPDATE')),
  (13, 'authenticated cannot UPDATE auctioneers.is_approved',
       NOT has_column_privilege('authenticated', 'public.auctioneers', 'is_approved', 'UPDATE')),
  (14, 'authenticated cannot UPDATE auctioneers.approval_date',
       NOT has_column_privilege('authenticated', 'public.auctioneers', 'approval_date', 'UPDATE')),
  (15, 'anon cannot UPDATE auctioneers at all',
       NOT has_table_privilege('anon', 'public.auctioneers', 'UPDATE')),
  (20, 'authenticated can still UPDATE users.first_name (profile edits work)',
       has_column_privilege('authenticated', 'public.users', 'first_name', 'UPDATE')),
  (21, 'authenticated can still UPDATE auctioneers.company_name (profile edits work)',
       has_column_privilege('authenticated', 'public.auctioneers', 'company_name', 'UPDATE')),
  (22, 'users: authenticated may UPDATE ('
         || COALESCE((SELECT cols FROM granted WHERE table_name = 'users'), 'nothing') || ')',
       (SELECT cols FROM granted WHERE table_name = 'users') IS NOT NULL),
  (23, 'auctioneers: authenticated may UPDATE ('
         || COALESCE((SELECT cols FROM granted WHERE table_name = 'auctioneers'), 'nothing') || ')',
       (SELECT cols FROM granted WHERE table_name = 'auctioneers') IS NOT NULL),
  (30, 'trigger protect_users_privileged_columns exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_users_privileged_columns' AND NOT tgisinternal)),
  (31, 'trigger protect_auctioneers_privileged_columns exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_auctioneers_privileged_columns' AND NOT tgisinternal)),
  (32, 'trigger protect_users_insert exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_users_insert' AND NOT tgisinternal)),
  (40, 'function change_user_role(uuid, uuid, user_role, text) exists',
       to_regprocedure('public.change_user_role(uuid, uuid, user_role, text)') IS NOT NULL),
  (41, 'function change_user_status(uuid, uuid, boolean, text) exists',
       to_regprocedure('public.change_user_status(uuid, uuid, boolean, text)') IS NOT NULL),
  (42, 'function log_admin_action(7 args) exists',
       to_regprocedure('public.log_admin_action(uuid, text, text, uuid, jsonb, jsonb, text)') IS NOT NULL),
  (43, 'old log_admin_action(6 args) removed',
       to_regprocedure('public.log_admin_action(uuid, text, text, uuid, jsonb, jsonb)') IS NULL),
  (44, 'anon cannot EXECUTE change_user_role',
       NOT has_function_privilege('anon', 'public.change_user_role(uuid, uuid, user_role, text)', 'EXECUTE')),
  (45, 'anon cannot EXECUTE change_user_status',
       NOT has_function_privilege('anon', 'public.change_user_status(uuid, uuid, boolean, text)', 'EXECUTE')),
  (46, 'anon cannot EXECUTE log_admin_action',
       NOT has_function_privilege('anon', 'public.log_admin_action(uuid, text, text, uuid, jsonb, jsonb, text)', 'EXECUTE')),
  (47, 'anon/authenticated cannot EXECUTE is_admin_or_service_role',
       NOT has_function_privilege('anon', 'public.is_admin_or_service_role()', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.is_admin_or_service_role()', 'EXECUTE')),
  (48, 'anon/authenticated cannot EXECUTE request_jwt_role',
       NOT has_function_privilege('anon', 'public.request_jwt_role()', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.request_jwt_role()', 'EXECUTE')),
  (50, 'storage policy "Auctioneers read own license files" exists',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auctioneers read own license files')),
  (51, 'storage policy "Admins manage license files" exists',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins manage license files'))
) AS checks (ord, check_name, ok)
ORDER BY ord;

$migration$;
insert into ita_internal.migrations(name,sha256) values('019_security_hardening_2.sql','8754de48738aacec321375c97a5c7c01da2ece2d4be48579d307b54207875915');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='019b_terms_accepted.sql' and sha256<>'bbadcf2209a72b7132b7777a6bc95dbdcdc871ce20e9bf881a636aca933152a3') then raise exception 'Migration checksum mismatch: 019b_terms_accepted.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='019b_terms_accepted.sql') then
execute $migration$
-- 019b: record when a user accepted the Terms of Service and Privacy Policy.
--
-- The signup form (components/auth/auth-form.tsx) requires the bidder to tick
-- "I agree to the Terms of Service and Privacy Policy" and passes the moment
-- of acceptance through Supabase signup metadata as
-- raw_user_meta_data->>'terms_accepted_at'. The public.users profile row is
-- created later by app/auth/callback/route.ts once the email is confirmed, so
-- a BEFORE INSERT trigger copies the timestamp from auth.users onto the new
-- profile row. Nothing else has to change for the column to be populated.
--
-- Idempotent: safe to re-run. Run after 019.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.terms_accepted_at IS
  'When the user accepted the Terms of Service and Privacy Policy at signup. NULL for accounts created before the checkbox existed.';

CREATE OR REPLACE FUNCTION public.users_apply_terms_accepted_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw_value TEXT;
BEGIN
  IF NEW.terms_accepted_at IS NULL THEN
    SELECT u.raw_user_meta_data ->> 'terms_accepted_at'
      INTO raw_value
      FROM auth.users u
     WHERE u.id = NEW.id;

    IF raw_value IS NOT NULL THEN
      BEGIN
        NEW.terms_accepted_at := raw_value::TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN
        -- Malformed metadata must never block profile creation.
        NEW.terms_accepted_at := NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_apply_terms_accepted_from_auth ON public.users;
CREATE TRIGGER users_apply_terms_accepted_from_auth
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_apply_terms_accepted_from_auth();

$migration$;
insert into ita_internal.migrations(name,sha256) values('019b_terms_accepted.sql','bbadcf2209a72b7132b7777a6bc95dbdcdc871ce20e9bf881a636aca933152a3');
end if;
end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='019c_payment_events_claim.sql' and sha256<>'7c6a7f7e5f87c00a1a87a1713c0098749d9e61b9be81956a097be8f959764c29') then raise exception 'Migration checksum mismatch: 019c_payment_events_claim.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='019c_payment_events_claim.sql') then
execute $migration$
-- 019c: atomic claim column for NMI webhook processing
--
-- /api/webhooks/nmi stores every verified event in payment_events and then
-- claims the row with a single conditional UPDATE before dispatching it, so two
-- concurrent deliveries of the same event_id cannot both run handlers. A claim
-- older than two minutes is treated as abandoned and may be taken over.
-- See docs/PAYMENTS.md, "Storage, claim, and idempotency".
--
-- Additive and idempotent; no existing rows are modified.

ALTER TABLE public.payment_events
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.payment_events.processing_started_at IS
    'Set while a webhook delivery is being handled; NULL when idle. Claims older than 2 minutes are considered abandoned and may be re-claimed.';

$migration$;
insert into ita_internal.migrations(name,sha256) values('019c_payment_events_claim.sql','7c6a7f7e5f87c00a1a87a1713c0098749d9e61b9be81956a097be8f959764c29');
end if;
end $checkpoint$;
commit;

notify pgrst,'reload schema';
select (select count(*) from ita_internal.migrations) as applied_migrations,(select count(*) from pg_tables where schemaname='public') as public_tables,(select count(*) from pg_tables where schemaname='public' and not rowsecurity) as tables_without_rls;
