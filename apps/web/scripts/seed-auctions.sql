-- =============================================================================
-- ImagineThisAuction Seed Data
-- Generated: 2026-01-29
--
-- IMPORTANT: Run the schema migration FIRST before running this seed data.
-- The schema migration is located at: supabase/migrations/0001_full_schema.sql
-- =============================================================================

-- First, disable RLS temporarily for seeding (requires superuser)
-- You may need to run these as a superuser or through Supabase dashboard

-- Create test user (bypassing auth.users constraint for seeding)
-- Note: In production, users are created through Supabase Auth
-- We need to drop the FK constraint temporarily, or create an auth user first

-- OPTION 1: If you can create an auth user first, do that via Supabase Auth dashboard
-- OPTION 2: Temporarily disable the FK constraint (requires superuser/service role)

-- Create the user (this requires the FK constraint to auth.users to be satisfied
-- or temporarily disabled)
INSERT INTO users (id, email, role, first_name, last_name, is_approved, created_at, updated_at) VALUES
('00000000-seed-user-0000-000000000001', 'test-auctioneer@imaginethisauction.test', 'auctioneer', 'Test', 'Auctioneer', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_approved = EXCLUDED.is_approved;

-- Create auctioneer organization
INSERT INTO auctioneers (id, user_id, company_name, address_line1, city, state, zip_code, website, is_approved, approval_date, created_at, updated_at) VALUES
('00000000-seed-auct-0000-000000000001', '00000000-seed-user-0000-000000000001', 'Test Auction House', '123 Auction Lane', 'Atlanta', 'GA', '30301', 'https://testauctions.example.com', true, NOW(), NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  is_approved = EXCLUDED.is_approved;

-- =============================================================================
-- AUCTION 1: Community Estate Sale (LIVE)
-- Starts 1 hour ago, ends in 24 hours
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
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- =============================================================================
-- Lots for Community Estate Sale (6 lots)
-- =============================================================================

-- Lot 1: Canon AE-1 Film Camera
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 1, 'Canon AE-1 Program 35mm Film Camera',
 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual. Perfect for photography enthusiasts or vintage collectors.',
 7500, 500, 10000, 15000, 'Electronics', '["/lots/camera-vintage.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 2: Vinyl Record Collection
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 2, 'Classic Rock & Jazz Vinyl Collection (25 LPs)',
 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more. All in VG+ to NM condition with original sleeves.',
 12000, 1000, 20000, 30000, 'Music', '["/lots/vinyl-records.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 3: Antique Rocking Chair
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 3, 'Handcrafted Oak Rocking Chair, c.1920',
 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms and spindle back. Minor wear consistent with age.',
 15000, 1000, 25000, 40000, 'Furniture', '["/lots/rocking-chair.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 4: Sports Memorabilia
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 4, 'Vintage Baseball Memorabilia Lot',
 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball. Cards are in good to excellent condition. Great starter collection!',
 5000, 500, 8000, 15000, 'Sports', '["/lots/sports-memorabilia.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 5: Vintage Toys
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 5, '1960s Tin Toy Robot & Vintage Games',
 'Nostalgic collection of classic toys including battery-operated tin robot, wooden building blocks, and vintage board games. Robot is in working condition!',
 8000, 500, 12000, 20000, 'Toys', '["/lots/vintage-toys.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 6: Handmade Pottery
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-live-0000-000000000001', 6, 'Artisan Ceramic Bowl & Vase Collection',
 'Set of 5 hand-thrown pottery pieces by local artist. Earth-toned glazes, each piece unique. Includes 2 serving bowls, 2 vases, and 1 decorative plate.',
 6000, 500, 10000, 18000, 'Art', '["/lots/pottery-handmade.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- =============================================================================
-- AUCTION 2: Vintage Collectors Showcase (SCHEDULED)
-- Starts in 2 days, ends in 4 days
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
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- =============================================================================
-- Lots for Vintage Collectors Showcase (4 lots)
-- =============================================================================

-- Lot 1: Vintage Typewriter
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 1, 'Vintage Remington Typewriter, c.1950',
 'Beautifully preserved Remington typewriter from the mid-century era. Fully functional with smooth key action. Includes original carrying case and fresh ribbon.',
 9000, 500, 12000, 18000, 'Antiques', '["/lots/vintage-typewriter.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 2: Antique Pocket Watch
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 2, 'Antique Gold Pocket Watch, c.1890',
 'Elegant gold-filled pocket watch with intricate engraving on case. Swiss movement, keeps excellent time. Includes original chain and presentation box.',
 25000, 2500, 35000, 50000, 'Jewelry', '["/lots/pocket-watch.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 3: Mid-Century Modern Lamp
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 3, 'Mid-Century Modern Arc Floor Lamp',
 'Iconic arching floor lamp in brushed nickel finish. Original marble base, adjustable arm. Quintessential 1960s design piece in excellent condition.',
 18000, 1000, 28000, 40000, 'Furniture', '["/lots/arc-lamp.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- Lot 4: Vintage Suitcase Set
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('00000000-seed-schd-0000-000000000001', 4, 'Vintage Leather Suitcase Set (3 Pieces)',
 'Matched set of three vintage leather suitcases from the 1940s. Beautiful patina, brass hardware, silk-lined interiors. Perfect for display or travel enthusiasts.',
 12000, 1000, 18000, 28000, 'Collectibles', '["/lots/vintage-suitcases.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- =============================================================================
-- Verification Queries (uncomment to verify data)
-- =============================================================================

-- SELECT 'Auctioneers' as table_name, COUNT(*) as count FROM auctioneers
-- UNION ALL
-- SELECT 'Auctions', COUNT(*) FROM auctions
-- UNION ALL
-- SELECT 'Lots', COUNT(*) FROM lots;

-- SELECT a.title as auction, a.status, COUNT(l.id) as lot_count
-- FROM auctions a
-- LEFT JOIN lots l ON l.auction_id = a.id
-- GROUP BY a.title, a.status;

-- =============================================================================
-- Summary of Created Data
-- =============================================================================
-- 1 Auctioneer: Test Auction House
-- 2 Auctions:
--   - Community Estate Sale (LIVE) - 6 lots
--   - Vintage Collectors Showcase (SCHEDULED) - 4 lots
-- 10 Total Lots
--
-- All prices are in ITC cents (e.g., 7500 = $75.00)
-- =============================================================================
