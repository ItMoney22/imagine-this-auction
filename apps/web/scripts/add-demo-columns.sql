-- Add demo_label and demo_run_id columns to support demo mode
-- These columns will be used to tag demo data and track demo runs

-- Add demo columns to auctions table
ALTER TABLE auctions
ADD COLUMN IF NOT EXISTS demo_label TEXT,
ADD COLUMN IF NOT EXISTS demo_run_id TEXT,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ended_reason TEXT;

-- Add demo columns to lots table
ALTER TABLE lots
ADD COLUMN IF NOT EXISTS demo_label TEXT,
ADD COLUMN IF NOT EXISTS demo_run_id TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS lot_starts_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lot_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ended_reason TEXT,
ADD COLUMN IF NOT EXISTS current_bid_itc INTEGER DEFAULT 0;

-- Add demo columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS demo_label TEXT,
ADD COLUMN IF NOT EXISTS demo_run_id TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add demo columns to bids table
ALTER TABLE bids
ADD COLUMN IF NOT EXISTS demo_label TEXT,
ADD COLUMN IF NOT EXISTS demo_run_id TEXT,
ADD COLUMN IF NOT EXISTS amount_itc INTEGER;

-- Add demo columns to auctioneers table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'auctioneers') THEN
        ALTER TABLE auctioneers
        ADD COLUMN IF NOT EXISTS demo_label TEXT,
        ADD COLUMN IF NOT EXISTS demo_run_id TEXT,
        ADD COLUMN IF NOT EXISTS company_name TEXT,
        ADD COLUMN IF NOT EXISTS business_license TEXT,
        ADD COLUMN IF NOT EXISTS address_line1 TEXT,
        ADD COLUMN IF NOT EXISTS city TEXT,
        ADD COLUMN IF NOT EXISTS state TEXT,
        ADD COLUMN IF NOT EXISTS zip_code TEXT,
        ADD COLUMN IF NOT EXISTS website TEXT;
    ELSE
        -- Create auctioneers table if it doesn't exist
        CREATE TABLE auctioneers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            demo_label TEXT,
            demo_run_id TEXT,
            company_name TEXT NOT NULL,
            business_license TEXT,
            address_line1 TEXT,
            city TEXT,
            state TEXT,
            zip_code TEXT,
            website TEXT,
            is_approved BOOLEAN DEFAULT false
        );
    END IF;
END $$;

-- Create indexes for better demo query performance
CREATE INDEX IF NOT EXISTS idx_auctions_demo_label ON auctions(demo_label);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_lots_demo_label ON lots(demo_label);
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);
CREATE INDEX IF NOT EXISTS idx_lots_auction_id ON lots(auction_id);
CREATE INDEX IF NOT EXISTS idx_users_demo_label ON users(demo_label);
CREATE INDEX IF NOT EXISTS idx_bids_demo_label ON bids(demo_label);

-- Update existing data to use amount_itc if amount exists
UPDATE bids SET amount_itc = amount WHERE amount_itc IS NULL AND amount IS NOT NULL;

-- Set default lot status values for existing lots
UPDATE lots SET status = 'approved' WHERE status IS NULL;

-- Set default auction status values
UPDATE auctions SET status = 'scheduled' WHERE status IS NULL;

COMMENT ON COLUMN auctions.demo_label IS 'Label to identify demo data (e.g., DEMO_RUN)';
COMMENT ON COLUMN auctions.demo_run_id IS 'Unique identifier for each demo run session';
COMMENT ON COLUMN lots.demo_label IS 'Label to identify demo data (e.g., DEMO_RUN)';
COMMENT ON COLUMN lots.demo_run_id IS 'Unique identifier for each demo run session';
COMMENT ON COLUMN lots.status IS 'Lot status: pending, approved, live, ended';
COMMENT ON COLUMN users.demo_label IS 'Label to identify demo data (e.g., DEMO_RUN)';
COMMENT ON COLUMN users.metadata IS 'JSON metadata including bot configuration';
COMMENT ON COLUMN bids.demo_label IS 'Label to identify demo data (e.g., DEMO_RUN)';
COMMENT ON COLUMN bids.amount_itc IS 'Bid amount in ITC tokens';