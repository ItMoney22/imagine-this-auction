-- ImagineThisAuction - Quick Setup Schema
-- Uses gen_random_uuid() which is built into PostgreSQL 13+

-- Create enums (skip if they exist)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('bidder', 'auctioneer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE auction_status AS ENUM ('draft', 'scheduled', 'live', 'ended', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role user_role DEFAULT 'bidder' NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    is_approved BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auctioneers table
CREATE TABLE IF NOT EXISTS auctioneers (
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
    approval_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auctions table
CREATE TABLE IF NOT EXISTS auctions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auctioneer_id UUID REFERENCES auctioneers(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status auction_status DEFAULT 'draft' NOT NULL,
    buyer_premium_percent DECIMAL(5,2) DEFAULT 10.00 NOT NULL,
    anti_sniping_seconds INTEGER DEFAULT 60 NOT NULL,
    terms_and_conditions TEXT,
    preview_start TIMESTAMPTZ,
    preview_end TIMESTAMPTZ,
    pickup_start TIMESTAMPTZ,
    pickup_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Lots table
CREATE TABLE IF NOT EXISTS lots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE NOT NULL,
    lot_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    starting_bid INTEGER DEFAULT 100 NOT NULL,
    reserve_price INTEGER,
    increment INTEGER DEFAULT 25 NOT NULL,
    current_high_bid INTEGER DEFAULT 0 NOT NULL,
    bid_count INTEGER DEFAULT 0 NOT NULL,
    category TEXT,
    dimensions TEXT,
    condition_report TEXT,
    provenance TEXT,
    estimate_low INTEGER,
    estimate_high INTEGER,
    images JSONB DEFAULT '[]'::jsonb,
    winner_id UUID REFERENCES users(id),
    is_sold BOOLEAN DEFAULT false NOT NULL,
    hammer_price INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_lot_number UNIQUE (auction_id, lot_number)
);

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lot_id UUID REFERENCES lots(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    amount_itc INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Wallet ledger
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    amount_itc INTEGER NOT NULL,
    ref_table TEXT,
    ref_id UUID,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =========================================
-- SEED DATA
-- =========================================

-- Create test user (we'll use a fixed UUID)
INSERT INTO users (id, email, role, first_name, last_name, is_approved)
VALUES ('00000000-0000-0000-0000-000000000001', 'test-auctioneer@test.com', 'auctioneer', 'Test', 'Auctioneer', true)
ON CONFLICT (id) DO NOTHING;

-- Create auctioneer
INSERT INTO auctioneers (id, user_id, company_name, address_line1, city, state, zip_code, is_approved, approval_date)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Community Auction House', '123 Main St', 'Atlanta', 'GA', '30301', true, now())
ON CONFLICT (id) DO NOTHING;

-- Create live auction
INSERT INTO auctions (id, auctioneer_id, title, description, status, starts_at, ends_at, buyer_premium_percent, anti_sniping_seconds)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'Community Estate Sale',
    'A wonderful collection of household treasures, vintage finds, and collectibles from a local family. Something for everyone!',
    'live',
    now() - interval '1 hour',
    now() + interval '24 hours',
    10.00,
    60
)
ON CONFLICT (id) DO NOTHING;

-- Create lots for the live auction
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-0000-0000-0000-000000000003', 1, 'Canon AE-1 Program 35mm Film Camera',
 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual.',
 7500, 500, 10000, 15000, 'Electronics', '["/lots/camera-vintage.webp"]'),

('00000000-0000-0000-0000-000000000003', 2, 'Classic Rock & Jazz Vinyl Collection (25 LPs)',
 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more.',
 12000, 1000, 20000, 30000, 'Music', '["/lots/vinyl-records.webp"]'),

('00000000-0000-0000-0000-000000000003', 3, 'Handcrafted Oak Rocking Chair, c.1920',
 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms.',
 15000, 1000, 25000, 40000, 'Furniture', '["/lots/rocking-chair.webp"]'),

('00000000-0000-0000-0000-000000000003', 4, 'Vintage Baseball Memorabilia Lot',
 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball.',
 5000, 500, 8000, 15000, 'Sports', '["/lots/sports-memorabilia.webp"]'),

('00000000-0000-0000-0000-000000000003', 5, '1960s Tin Toy Robot & Vintage Games',
 'Nostalgic collection of classic toys including battery-operated tin robot and vintage board games.',
 8000, 500, 12000, 20000, 'Toys', '["/lots/vintage-toys.webp"]'),

('00000000-0000-0000-0000-000000000003', 6, 'Artisan Ceramic Bowl & Vase Collection',
 'Set of 5 hand-thrown pottery pieces by local artist. Earth-toned glazes, each piece unique.',
 6000, 500, 10000, 18000, 'Art', '["/lots/pottery-handmade.webp"]')
ON CONFLICT (auction_id, lot_number) DO NOTHING;

-- Disable RLS for testing (can be enabled later)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctioneers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development
CREATE POLICY IF NOT EXISTS "Allow all for users" ON users FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for auctioneers" ON auctioneers FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for auctions" ON auctions FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for lots" ON lots FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for bids" ON bids FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for wallet_ledger" ON wallet_ledger FOR ALL USING (true);
