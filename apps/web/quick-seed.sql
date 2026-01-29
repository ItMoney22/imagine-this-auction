-- Quick seed data for demo
-- Insert dummy data directly

-- First, let's create some users
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('11111111-1111-1111-1111-111111111111', 'admin@example.com', 'admin', 'Demo', 'Admin', true),
('22222222-2222-2222-2222-222222222222', 'auctioneer@example.com', 'auctioneer', 'Demo', 'Auctioneer', true),
('33333333-3333-3333-3333-333333333333', 'bidder1@example.com', 'bidder', 'Alice', 'Johnson', true),
('44444444-4444-4444-4444-444444444444', 'bidder2@example.com', 'bidder', 'Bob', 'Smith', true),
('55555555-5555-5555-5555-555555555555', 'bidder3@example.com', 'bidder', 'Carol', 'Wilson', true)
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_approved = EXCLUDED.is_approved;

-- Create auctioneer company
INSERT INTO auctioneers (id, user_id, company_name, business_license, address_line1, city, state, zip_code, is_approved, approval_date) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Heritage Auctions Demo', 'GA-DEMO-001', '123 Demo Street', 'Atlanta', 'GA', '30309', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  is_approved = EXCLUDED.is_approved;

-- Create demo auctions
INSERT INTO auctions (id, auctioneer_id, title, description, starts_at, ends_at, status, buyer_premium_percent) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Demo Fine Art Auction', 'A demonstration auction featuring fine art pieces', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'live', 10.00),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Demo Vintage Collection', 'Upcoming auction with vintage items', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 'scheduled', 12.00)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

-- Create demo lots for the live auction
INSERT INTO lots (id, auction_id, lot_number, title, description, starting_bid, reserve_price, increment, current_high_bid, bid_count, category, estimate_low, estimate_high, images) VALUES
('lot00001-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'Abstract Modern Painting', 'Beautiful abstract painting by contemporary artist', 50000, 75000, 2500, 67500, 3, 'Fine Art', 75000, 100000, '["https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500"]'),
('lot00002-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, 'Vintage Mahogany Table', 'Antique mahogany dining table from the 1920s', 25000, null, 1000, 32000, 5, 'Furniture', 30000, 45000, '["https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=500"]'),
('lot00003-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3, 'Bronze Sculpture Set', 'Pair of bronze sculptures by renowned artist', 15000, 20000, 500, 18500, 2, 'Sculpture', 20000, 30000, '["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500"]'),
('lot00004-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 4, 'Chinese Porcelain Vase', 'Ming Dynasty inspired porcelain vase', 8000, null, 250, 9500, 4, 'Ceramics', 10000, 15000, '["https://images.unsplash.com/photo-1578662015141-14b4c8027c2c?w=500"]'),
('lot00005-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5, 'Art Deco Mirror', 'Stunning Art Deco mirror with original frame', 12000, 18000, 500, 14000, 3, 'Decorative Arts', 15000, 22000, '["https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500"]')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  current_high_bid = EXCLUDED.current_high_bid,
  bid_count = EXCLUDED.bid_count;

-- Create some demo lots for the upcoming auction
INSERT INTO lots (id, auction_id, lot_number, title, description, starting_bid, reserve_price, increment, category, estimate_low, estimate_high, images) VALUES
('watch001-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'Vintage Rolex Submariner', 'Classic Rolex Submariner from the 1980s', 800000, 1000000, 25000, 'Watches', 1000000, 1300000, '["https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=500"]'),
('watch002-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 2, 'Omega Speedmaster', 'Moon watch with original documentation', 350000, 400000, 10000, 'Watches', 400000, 550000, '["https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=500"]'),
('watch003-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 'Patek Philippe Calatrava', 'Elegant dress watch in yellow gold', 1500000, 2000000, 50000, 'Watches', 2000000, 2500000, '["https://images.unsplash.com/photo-1594534475808-b18fc33b045e?w=500"]')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description;

-- Add some sample bids to the live auction
INSERT INTO bids (id, lot_id, bidder_id, amount, is_winning, created_at) VALUES
('bid00001-1111-1111-1111-111111111111', 'lot00001-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 50000, false, NOW() - INTERVAL '2 hours'),
('bid00002-2222-2222-2222-222222222222', 'lot00001-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 55000, false, NOW() - INTERVAL '1 hour'),
('bid00003-3333-3333-3333-333333333333', 'lot00001-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 67500, true, NOW() - INTERVAL '30 minutes'),

('bid00004-4444-4444-4444-444444444444', 'lot00002-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 25000, false, NOW() - INTERVAL '3 hours'),
('bid00005-5555-5555-5555-555555555555', 'lot00002-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 28000, false, NOW() - INTERVAL '2 hours'),
('bid00006-6666-6666-6666-666666666666', 'lot00002-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 30000, false, NOW() - INTERVAL '1 hour'),
('bid00007-7777-7777-7777-777777777777', 'lot00002-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 32000, true, NOW() - INTERVAL '45 minutes')
ON CONFLICT (id) DO NOTHING;

-- Add wallet credits for bidders
INSERT INTO wallet_ledger (id, user_id, transaction_type, amount, balance_after, description, created_at) VALUES
('wallet01-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'purchase', 10000000, 10000000, 'Initial credit purchase - $1,000', NOW() - INTERVAL '1 day'),
('wallet02-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'purchase', 8000000, 8000000, 'Initial credit purchase - $800', NOW() - INTERVAL '1 day'),
('wallet03-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'purchase', 12000000, 12000000, 'Initial credit purchase - $1,200', NOW() - INTERVAL '1 day'),

-- Add bid holds for current winning bids
('wallet04-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'bid_hold', -6750000, 5250000, 'Bid hold for lot #1', NOW() - INTERVAL '30 minutes'),
('wallet05-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'bid_hold', -3200000, 6800000, 'Bid hold for lot #2', NOW() - INTERVAL '45 minutes')
ON CONFLICT (id) DO NOTHING;