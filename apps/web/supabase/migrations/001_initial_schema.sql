-- ImagineThisAuction - Initial Database Schema
-- Task B: Schema & Migrations

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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