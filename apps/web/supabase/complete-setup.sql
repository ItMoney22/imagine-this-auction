-- =============================================================================
-- ImagineThisAuction - COMPLETE SETUP SCRIPT
-- Creates auth users, public users, auctioneers, auctions, lots, and wallet credits
-- Run this in Supabase SQL Editor or via supabase db execute
-- =============================================================================

-- =============================================================================
-- STEP 1: CREATE AUTH USERS
-- =============================================================================

-- Admin User (davidltrinidad@gmail.com)
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'davidltrinidad@gmail.com',
    crypt('TestPass123!', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "David", "last_name": "Trinidad"}',
    false
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Auctioneer User
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
    'a0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'auctioneer@test.com',
    crypt('TestPass123!', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Test", "last_name": "Auctioneer"}',
    false
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Bidder 1
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
    'a0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bidder1@test.com',
    crypt('TestPass123!', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Alice", "last_name": "Bidder"}',
    false
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Bidder 2
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
    'a0000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bidder2@test.com',
    crypt('TestPass123!', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Bob", "last_name": "Bidder"}',
    false
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Bidder 3
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
    'a0000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'bidder3@test.com',
    crypt('TestPass123!', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Carol", "last_name": "Bidder"}',
    false
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- =============================================================================
-- STEP 2: CREATE PUBLIC USERS (with roles)
-- =============================================================================

-- Admin
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('a0000000-0000-0000-0000-000000000001', 'davidltrinidad@gmail.com', 'admin', 'David', 'Trinidad', true)
ON CONFLICT (id) DO UPDATE SET role = 'admin', is_approved = true;

-- Auctioneer
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('a0000000-0000-0000-0000-000000000002', 'auctioneer@test.com', 'auctioneer', 'Test', 'Auctioneer', true)
ON CONFLICT (id) DO UPDATE SET role = 'auctioneer', is_approved = true;

-- Bidders
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('a0000000-0000-0000-0000-000000000003', 'bidder1@test.com', 'bidder', 'Alice', 'Bidder', true),
('a0000000-0000-0000-0000-000000000004', 'bidder2@test.com', 'bidder', 'Bob', 'Bidder', true),
('a0000000-0000-0000-0000-000000000005', 'bidder3@test.com', 'bidder', 'Carol', 'Bidder', true)
ON CONFLICT (id) DO UPDATE SET is_approved = true;

-- =============================================================================
-- STEP 3: CREATE AUCTIONEER ORGANIZATION
-- =============================================================================

INSERT INTO auctioneers (
    id, user_id, company_name, address_line1, city, state, zip_code,
    website, is_approved, approval_date
) VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'Community Auction House',
    '123 Main Street',
    'Atlanta', 'GA', '30301',
    'https://communityauctions.test',
    true, NOW()
) ON CONFLICT (id) DO UPDATE SET is_approved = true;

-- =============================================================================
-- STEP 4: CREATE LIVE AUCTION
-- =============================================================================

INSERT INTO auctions (
    id, auctioneer_id, title, description, status,
    starts_at, ends_at, buyer_premium_percent, anti_sniping_seconds
) VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Community Estate Sale',
    'A wonderful collection of household treasures, vintage finds, and collectibles from a local family. Something for everyone!',
    'live',
    NOW() - INTERVAL '1 hour',
    NOW() + INTERVAL '24 hours',
    10.00, 60
) ON CONFLICT (id) DO UPDATE SET
    status = 'live',
    starts_at = NOW() - INTERVAL '1 hour',
    ends_at = NOW() + INTERVAL '24 hours';

-- =============================================================================
-- STEP 5: CREATE LOTS
-- =============================================================================

-- Delete existing lots for this auction to avoid conflicts
DELETE FROM lots WHERE auction_id = 'c0000000-0000-0000-0000-000000000001';

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('c0000000-0000-0000-0000-000000000001', 1,
 'Canon AE-1 Program 35mm Film Camera',
 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual. Perfect for photography enthusiasts!',
 7500, 500, 10000, 15000, 'Electronics', '["/lots/camera-vintage.webp"]'),

('c0000000-0000-0000-0000-000000000001', 2,
 'Classic Rock & Jazz Vinyl Collection (25 LPs)',
 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more. All in VG+ to NM condition.',
 12000, 1000, 20000, 30000, 'Music', '["/lots/vinyl-records.webp"]'),

('c0000000-0000-0000-0000-000000000001', 3,
 'Handcrafted Oak Rocking Chair, c.1920',
 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms. A true heirloom piece!',
 15000, 1000, 25000, 40000, 'Furniture', '["/lots/rocking-chair.webp"]'),

('c0000000-0000-0000-0000-000000000001', 4,
 'Vintage Baseball Memorabilia Lot',
 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball. Great for sports fans!',
 5000, 500, 8000, 15000, 'Sports', '["/lots/sports-memorabilia.webp"]'),

('c0000000-0000-0000-0000-000000000001', 5,
 '1960s Tin Toy Robot & Vintage Games',
 'Nostalgic collection of classic toys including battery-operated tin robot and vintage board games. Bring back childhood memories!',
 8000, 500, 12000, 20000, 'Toys', '["/lots/vintage-toys.webp"]'),

('c0000000-0000-0000-0000-000000000001', 6,
 'Artisan Ceramic Bowl & Vase Collection',
 'Set of 5 hand-thrown pottery pieces by local artist. Beautiful earth-toned glazes, each piece unique. Perfect for home decor!',
 6000, 500, 10000, 18000, 'Art', '["/lots/pottery-handmade.webp"]');

-- =============================================================================
-- STEP 6: GIVE BIDDERS WALLET CREDITS
-- =============================================================================

-- Delete existing wallet entries for these users to avoid duplicates
DELETE FROM wallet_ledger WHERE user_id IN (
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005'
);

-- Alice gets $500 (50000 ITC cents)
INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description) VALUES
('a0000000-0000-0000-0000-000000000003', 'purchase', 50000, 50000, 'Welcome bonus - $500 ITC credits');

-- Bob gets $750 (75000 ITC cents)
INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description) VALUES
('a0000000-0000-0000-0000-000000000004', 'purchase', 75000, 75000, 'Welcome bonus - $750 ITC credits');

-- Carol gets $1000 (100000 ITC cents)
INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description) VALUES
('a0000000-0000-0000-0000-000000000005', 'purchase', 100000, 100000, 'Welcome bonus - $1000 ITC credits');

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

SELECT 'AUTH USERS' as section, COUNT(*) as count FROM auth.users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com';
SELECT 'PUBLIC USERS' as section, COUNT(*) as count FROM users;
SELECT 'AUCTIONEERS' as section, COUNT(*) as count FROM auctioneers;
SELECT 'AUCTIONS' as section, COUNT(*) as count FROM auctions;
SELECT 'LOTS' as section, COUNT(*) as count FROM lots;
SELECT 'WALLET ENTRIES' as section, COUNT(*) as count FROM wallet_ledger;

-- Show user details
SELECT email, role, is_approved FROM users ORDER BY role;

-- Show auction status
SELECT title, status, starts_at, ends_at FROM auctions;

-- Show lots
SELECT lot_number, title, starting_bid/100.0 as starting_price_usd FROM lots ORDER BY lot_number;

-- Show wallet balances
SELECT u.email, w.amount/100.0 as balance_usd
FROM wallet_ledger w
JOIN users u ON w.user_id = u.id
WHERE w.transaction_type = 'purchase';

-- =============================================================================
-- DONE! Your test data is ready.
--
-- Login credentials:
-- - Admin: davidltrinidad@gmail.com / TestPass123!
-- - Auctioneer: auctioneer@test.com / TestPass123!
-- - Bidder 1: bidder1@test.com / TestPass123! ($500 balance)
-- - Bidder 2: bidder2@test.com / TestPass123! ($750 balance)
-- - Bidder 3: bidder3@test.com / TestPass123! ($1000 balance)
-- =============================================================================
