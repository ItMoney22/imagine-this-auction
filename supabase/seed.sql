-- ==========================================
-- ImagineThisAuction - Test Data Seed Script
-- ==========================================
-- This script creates test users, an auction, lots, and wallet credits
-- Run this directly in Supabase SQL Editor with service_role privileges
-- ==========================================

-- Clean up existing test data (optional, comment out if not needed)
-- DELETE FROM bids WHERE bidder_id IN (SELECT id FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com');
-- DELETE FROM wallet_ledger WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com');
-- DELETE FROM lots WHERE auction_id IN (SELECT id FROM auctions WHERE auctioneer_id IN (SELECT id FROM auctioneers WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')));
-- DELETE FROM auctions WHERE auctioneer_id IN (SELECT id FROM auctioneers WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com'));
-- DELETE FROM auctioneers WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
-- DELETE FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com';

-- ==========================================
-- Create Auth Users (requires Supabase Dashboard or service role)
-- ==========================================
-- NOTE: You must create these users through the Supabase Dashboard > Authentication > Users
-- or use the Supabase Management API with service_role key
--
-- Users to create:
-- 1. davidltrinidad@gmail.com (password: TestPass123!)
-- 2. auctioneer@test.com (password: TestPass123!)
-- 3. bidder1@test.com (password: TestPass123!)
-- 4. bidder2@test.com (password: TestPass123!)
-- 5. bidder3@test.com (password: TestPass123!)
--
-- After creating auth users, note their UUIDs and update the INSERT statements below

-- ==========================================
-- Temporary: Insert Users Directly
-- ==========================================
-- WARNING: This bypasses proper auth.users creation and is only for testing
-- In production, users must be created through Supabase Auth

-- Create user records (replace UUIDs with actual auth.users IDs)
-- First, you need to get the auth user IDs from: SELECT id, email FROM auth.users WHERE email IN (...)

DO $$
DECLARE
    admin_id UUID;
    auctioneer_id UUID;
    bidder1_id UUID;
    bidder2_id UUID;
    bidder3_id UUID;
    auctioneer_profile_id UUID;
    auction_id UUID;
BEGIN
    -- Get existing auth user IDs (if they exist)
    SELECT id INTO admin_id FROM auth.users WHERE email = 'davidltrinidad@gmail.com';
    SELECT id INTO auctioneer_id FROM auth.users WHERE email = 'auctioneer@test.com';
    SELECT id INTO bidder1_id FROM auth.users WHERE email = 'bidder1@test.com';
    SELECT id INTO bidder2_id FROM auth.users WHERE email = 'bidder2@test.com';
    SELECT id INTO bidder3_id FROM auth.users WHERE email = 'bidder3@test.com';

    -- If users don't exist in auth.users, you need to create them first through the dashboard
    IF admin_id IS NULL THEN
        RAISE NOTICE 'Admin user not found. Create davidltrinidad@gmail.com in Supabase Auth first.';
    ELSE
        -- Insert or update admin user
        INSERT INTO users (id, email, role, first_name, last_name, phone, is_approved)
        VALUES (admin_id, 'davidltrinidad@gmail.com', 'admin', 'David', 'Trinidad', '+1-555-0100', true)
        ON CONFLICT (id) DO UPDATE
        SET role = 'admin', is_approved = true, updated_at = NOW();
        RAISE NOTICE 'Admin user created/updated: %', admin_id;
    END IF;

    IF auctioneer_id IS NULL THEN
        RAISE NOTICE 'Auctioneer user not found. Create auctioneer@test.com in Supabase Auth first.';
    ELSE
        -- Insert or update auctioneer user
        INSERT INTO users (id, email, role, first_name, last_name, phone, is_approved)
        VALUES (auctioneer_id, 'auctioneer@test.com', 'auctioneer', 'Alice', 'Auctioneer', '+1-555-0101', true)
        ON CONFLICT (id) DO UPDATE
        SET role = 'auctioneer', is_approved = true, updated_at = NOW();
        RAISE NOTICE 'Auctioneer user created/updated: %', auctioneer_id;

        -- Create auctioneer profile
        INSERT INTO auctioneers (user_id, company_name, business_license, tax_id, address_line1, city, state, zip_code, website, is_approved, approval_date)
        VALUES (
            auctioneer_id,
            'Test Auction House',
            'TEST-LIC-2024-001',
            '12-3456789',
            '123 Auction Street',
            'New York',
            'NY',
            '10001',
            'https://testauctions.example.com',
            true,
            NOW()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET is_approved = true, approval_date = NOW(), updated_at = NOW()
        RETURNING id INTO auctioneer_profile_id;
        RAISE NOTICE 'Auctioneer profile created/updated: %', auctioneer_profile_id;

        -- Create live auction
        INSERT INTO auctions (
            auctioneer_id,
            title,
            description,
            starts_at,
            ends_at,
            status,
            buyer_premium_percent,
            anti_sniping_seconds,
            terms_and_conditions,
            preview_start,
            preview_end,
            pickup_start,
            pickup_end
        ) VALUES (
            auctioneer_profile_id,
            'Community Collectibles & Treasures Auction',
            'A carefully curated selection of vintage collectibles, antiques, and unique items from local estates and collectors. All items authenticated and ready for new homes!',
            NOW() - INTERVAL '2 hours',  -- Started 2 hours ago
            NOW() + INTERVAL '6 hours',  -- Ends in 6 hours
            'live',
            15.00,
            120,
            'All sales final. Payment due within 48 hours. Local pickup available or shipping can be arranged.',
            NOW() - INTERVAL '24 hours',
            NOW() - INTERVAL '2 hours',
            NOW() + INTERVAL '7 days',
            NOW() + INTERVAL '14 days'
        )
        RETURNING id INTO auction_id;
        RAISE NOTICE 'Auction created: %', auction_id;

        -- Create auction lots
        INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, reserve_price, increment, category, condition_report, estimate_low, estimate_high)
        VALUES
            (
                auction_id, 1,
                'Vintage Canon AE-1 Camera with 50mm Lens',
                'Classic 35mm SLR camera from 1976 in excellent working condition. Comes with original Canon FD 50mm f/1.8 lens, leather case, and manual. Perfect for film photography enthusiasts.',
                15000, 20000, 500,
                'Photography',
                'Excellent condition, light meter working, shutter speeds accurate. Minor cosmetic wear consistent with age.',
                15000, 25000
            ),
            (
                auction_id, 2,
                'Collection of Classic Rock Vinyl Records (25 Albums)',
                'Curated collection of 1970s-80s rock albums including Led Zeppelin, Pink Floyd, The Beatles, and more. All in VG+ to NM condition.',
                20000, 30000, 1000,
                'Music',
                'Vinyl grades from VG+ to NM. Covers show minimal shelf wear. No skips or major scratches.',
                25000, 40000
            ),
            (
                auction_id, 3,
                'Handcrafted Oak Rocking Chair (circa 1920)',
                'Beautiful antique solid oak rocking chair with carved details. Original finish, recently restored. Comfortable and sturdy.',
                12000, 18000, 500,
                'Furniture',
                'Structurally sound, professionally cleaned and oiled. Minor age-appropriate wear on armrests.',
                15000, 30000
            ),
            (
                auction_id, 4,
                'Signed Baseball Memorabilia Collection',
                'Authenticated collection including signed baseballs, vintage baseball cards (1980s-90s), and framed team photo. Includes certificate of authenticity.',
                25000, 35000, 1000,
                'Sports Collectibles',
                'All items authenticated by PSA/DNA. Cards professionally graded, baseballs in protective cases.',
                30000, 50000
            ),
            (
                auction_id, 5,
                'Vintage Star Wars Action Figures (Original Kenner 1977-1985)',
                'Collection of 12 original Kenner Star Wars action figures in excellent condition with accessories. Includes Luke Skywalker, Darth Vader, Han Solo, and more.',
                30000, 40000, 1000,
                'Toys & Collectibles',
                'All figures complete with original accessories. Joints tight, paint excellent. No reproduction parts.',
                35000, 60000
            ),
            (
                auction_id, 6,
                'Handmade Ceramic Pottery Set by Local Artist',
                'Beautiful set of handcrafted stoneware pottery including serving bowls, dinner plates, and mugs. Unique glazing in earth tones. Set of 8 place settings.',
                8000, 12000, 500,
                'Art & Pottery',
                'Mint condition, never used. Food-safe, dishwasher safe glazes. Signed by artist.',
                10000, 20000
            );
        RAISE NOTICE 'Created 6 auction lots';
    END IF;

    -- Create bidder users and add wallet credits
    IF bidder1_id IS NOT NULL THEN
        INSERT INTO users (id, email, role, first_name, last_name, phone, is_approved)
        VALUES (bidder1_id, 'bidder1@test.com', 'bidder', 'Bob', 'Bidder', '+1-555-0201', true)
        ON CONFLICT (id) DO UPDATE
        SET role = 'bidder', is_approved = true, updated_at = NOW();

        -- Add $500 ITC credits
        INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_type, metadata)
        VALUES (
            bidder1_id,
            'purchase',
            50000,
            50000,
            'Initial test credits for bidding',
            'test_seed',
            '{"source": "seed_script"}'::jsonb
        );
        RAISE NOTICE 'Bidder 1 created with $500 credits: %', bidder1_id;
    ELSE
        RAISE NOTICE 'Bidder1 user not found. Create bidder1@test.com in Supabase Auth first.';
    END IF;

    IF bidder2_id IS NOT NULL THEN
        INSERT INTO users (id, email, role, first_name, last_name, phone, is_approved)
        VALUES (bidder2_id, 'bidder2@test.com', 'bidder', 'Carol', 'Collector', '+1-555-0202', true)
        ON CONFLICT (id) DO UPDATE
        SET role = 'bidder', is_approved = true, updated_at = NOW();

        -- Add $750 ITC credits
        INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_type, metadata)
        VALUES (
            bidder2_id,
            'purchase',
            75000,
            75000,
            'Initial test credits for bidding',
            'test_seed',
            '{"source": "seed_script"}'::jsonb
        );
        RAISE NOTICE 'Bidder 2 created with $750 credits: %', bidder2_id;
    ELSE
        RAISE NOTICE 'Bidder2 user not found. Create bidder2@test.com in Supabase Auth first.';
    END IF;

    IF bidder3_id IS NOT NULL THEN
        INSERT INTO users (id, email, role, first_name, last_name, phone, is_approved)
        VALUES (bidder3_id, 'bidder3@test.com', 'bidder', 'Dan', 'Dealer', '+1-555-0203', true)
        ON CONFLICT (id) DO UPDATE
        SET role = 'bidder', is_approved = true, updated_at = NOW();

        -- Add $1000 ITC credits
        INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_type, metadata)
        VALUES (
            bidder3_id,
            'purchase',
            100000,
            100000,
            'Initial test credits for bidding',
            'test_seed',
            '{"source": "seed_script"}'::jsonb
        );
        RAISE NOTICE 'Bidder 3 created with $1000 credits: %', bidder3_id;
    ELSE
        RAISE NOTICE 'Bidder3 user not found. Create bidder3@test.com in Supabase Auth first.';
    END IF;

END $$;

-- ==========================================
-- Verification Queries
-- ==========================================
-- Run these to verify the seed data was created correctly

-- Check users
SELECT
    email,
    role,
    first_name || ' ' || last_name as name,
    is_approved,
    created_at
FROM users
WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com'
ORDER BY role, email;

-- Check auctioneer profile
SELECT
    u.email,
    a.company_name,
    a.is_approved,
    a.created_at
FROM auctioneers a
JOIN users u ON a.user_id = u.id
WHERE u.email = 'auctioneer@test.com';

-- Check auction
SELECT
    id,
    title,
    status,
    starts_at,
    ends_at,
    (SELECT COUNT(*) FROM lots WHERE auction_id = auctions.id) as lot_count
FROM auctions
WHERE title LIKE '%Community Collectibles%';

-- Check lots
SELECT
    lot_number,
    title,
    starting_bid / 100.0 as starting_bid_dollars,
    reserve_price / 100.0 as reserve_price_dollars,
    category
FROM lots
WHERE auction_id IN (SELECT id FROM auctions WHERE title LIKE '%Community Collectibles%')
ORDER BY lot_number;

-- Check wallet balances
SELECT
    u.email,
    u.first_name,
    SUM(w.amount) / 100.0 as balance_dollars
FROM wallet_ledger w
JOIN users u ON w.user_id = u.id
WHERE u.email LIKE 'bidder%@test.com'
GROUP BY u.id, u.email, u.first_name
ORDER BY u.email;
