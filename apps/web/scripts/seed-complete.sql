-- =============================================================================
-- ImagineThisAuction - Complete Setup Script
-- Run this in the Supabase SQL Editor to set up schema and seed data
-- =============================================================================

-- STEP 1: First, we need to create a test user in auth.users
-- This is required because our users table references auth.users

-- Create a test auth user (this creates an entry in auth.users)
-- Note: You can also create this user through the Supabase Auth dashboard
DO $$
BEGIN
  -- Insert test user into auth.users if it doesn't exist
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    '00000000-seed-user-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'test-auctioneer@imaginethisauction.test',
    crypt('testpassword123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"first_name": "Test", "last_name": "Auctioneer"}',
    false,
    '',
    '',
    '',
    ''
  ) ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Auth user may already exist or there was an issue: %', SQLERRM;
END $$;

-- STEP 2: Create the public.users record
INSERT INTO users (id, email, role, first_name, last_name, is_approved, created_at, updated_at) VALUES
('00000000-seed-user-0000-000000000001', 'test-auctioneer@imaginethisauction.test', 'auctioneer', 'Test', 'Auctioneer', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_approved = EXCLUDED.is_approved,
  role = EXCLUDED.role;

-- STEP 3: Create auctioneer organization
INSERT INTO auctioneers (id, user_id, company_name, address_line1, city, state, zip_code, website, is_approved, approval_date, created_at, updated_at) VALUES
('00000000-seed-auct-0000-000000000001', '00000000-seed-user-0000-000000000001', 'Test Auction House', '123 Auction Lane', 'Atlanta', 'GA', '30301', 'https://testauctions.example.com', true, NOW(), NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  is_approved = EXCLUDED.is_approved;

-- =============================================================================
-- AUCTION 1: Community Estate Sale (LIVE)
-- =============================================================================
INSERT INTO auctions (id, auctioneer_id, title, description, status, starts_at, ends_at, buyer_premium_percent, anti_sniping_seconds, created_at, updated_at) VALUES
('00000000-seed-live-0000-000000000001', '00000000-seed-auct-0000-000000000001',
 'Community Estate Sale',
 'A wonderful collection of household treasures, vintage finds, and collectibles from a local family. Something for everyone!',
 'live',
 NOW() - INTERVAL '1 hour',
 NOW() + INTERVAL '24 hours',
 10.00, 60, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  starts_at = NOW() - INTERVAL '1 hour',
  ends_at = NOW() + INTERVAL '24 hours';

-- Lots for Community Estate Sale
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 1, 'Canon AE-1 Program 35mm Film Camera',
 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual. Perfect for photography enthusiasts or vintage collectors.',
 7500, 500, 10000, 15000, 'Electronics', '["/lots/camera-vintage.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 2, 'Classic Rock & Jazz Vinyl Collection (25 LPs)',
 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more. All in VG+ to NM condition with original sleeves.',
 12000, 1000, 20000, 30000, 'Music', '["/lots/vinyl-records.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 3, 'Handcrafted Oak Rocking Chair, c.1920',
 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms and spindle back. Minor wear consistent with age.',
 15000, 1000, 25000, 40000, 'Furniture', '["/lots/rocking-chair.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 4, 'Vintage Baseball Memorabilia Lot',
 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball. Cards are in good to excellent condition. Great starter collection!',
 5000, 500, 8000, 15000, 'Sports', '["/lots/sports-memorabilia.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 5, '1960s Tin Toy Robot & Vintage Games',
 'Nostalgic collection of classic toys including battery-operated tin robot, wooden building blocks, and vintage board games. Robot is in working condition!',
 8000, 500, 12000, 20000, 'Toys', '["/lots/vintage-toys.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 6, 'Artisan Ceramic Bowl & Vase Collection',
 'Set of 5 hand-thrown pottery pieces by local artist. Earth-toned glazes, each piece unique. Includes 2 serving bowls, 2 vases, and 1 decorative plate.',
 6000, 500, 10000, 18000, 'Art', '["/lots/pottery-handmade.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

-- =============================================================================
-- AUCTION 2: Vintage Collectors Showcase (SCHEDULED)
-- =============================================================================
INSERT INTO auctions (id, auctioneer_id, title, description, status, starts_at, ends_at, buyer_premium_percent, anti_sniping_seconds, created_at, updated_at) VALUES
('00000000-seed-schd-0000-000000000001', '00000000-seed-auct-0000-000000000001',
 'Vintage Collectors Showcase',
 'Curated vintage items for collectors and enthusiasts. Preview available before bidding begins.',
 'scheduled',
 NOW() + INTERVAL '2 days',
 NOW() + INTERVAL '4 days',
 12.00, 60, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  starts_at = NOW() + INTERVAL '2 days',
  ends_at = NOW() + INTERVAL '4 days';

-- Lots for Vintage Collectors Showcase
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 1, 'Vintage Remington Typewriter, c.1950',
 'Beautifully preserved Remington typewriter from the mid-century era. Fully functional with smooth key action. Includes original carrying case and fresh ribbon.',
 9000, 500, 12000, 18000, 'Antiques', '["/lots/vintage-typewriter.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 2, 'Antique Gold Pocket Watch, c.1890',
 'Elegant gold-filled pocket watch with intricate engraving on case. Swiss movement, keeps excellent time. Includes original chain and presentation box.',
 25000, 2500, 35000, 50000, 'Jewelry', '["/lots/pocket-watch.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 3, 'Mid-Century Modern Arc Floor Lamp',
 'Iconic arching floor lamp in brushed nickel finish. Original marble base, adjustable arm. Quintessential 1960s design piece in excellent condition.',
 18000, 1000, 28000, 40000, 'Furniture', '["/lots/arc-lamp.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 4, 'Vintage Leather Suitcase Set (3 Pieces)',
 'Matched set of three vintage leather suitcases from the 1940s. Beautiful patina, brass hardware, silk-lined interiors. Perfect for display or travel enthusiasts.',
 12000, 1000, 18000, 28000, 'Collectibles', '["/lots/vintage-suitcases.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

-- =============================================================================
-- Verification Query - Run this to verify the seed data
-- =============================================================================
SELECT
  'Auctioneers' as table_name,
  COUNT(*)::text as count,
  '' as details
FROM auctioneers
UNION ALL
SELECT
  'Auctions',
  COUNT(*)::text,
  string_agg(title || ' (' || status || ')', ', ')
FROM auctions
UNION ALL
SELECT
  'Lots',
  COUNT(*)::text,
  ''
FROM lots;

-- =============================================================================
-- Summary
-- =============================================================================
-- Created:
--   - 1 Test Auctioneer: "Test Auction House"
--   - 2 Auctions:
--       1. "Community Estate Sale" (LIVE) - 6 lots
--       2. "Vintage Collectors Showcase" (SCHEDULED) - 4 lots
--   - 10 Total Lots
--
-- All prices are in ITC cents (e.g., 7500 = $75.00)
-- =============================================================================
