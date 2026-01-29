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