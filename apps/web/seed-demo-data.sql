-- Demo seed data with test auctions and admin setup
-- This script adds comprehensive test data to showcase the platform

-- First, let's create admin and demo users
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at
) VALUES
(
  '11111111-1111-1111-1111-111111111111'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'admin@imaginethisauction.com',
  '$2a$10$X0lNZnBwfvfUzOOFhz3LCe4GJJ7aGMZJGJQm7ZJ2JYzWy8gKdQ1z6', -- password: admin123
  now(),
  now(),
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin"}',
  false,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null
),
(
  '22222222-2222-2222-2222-222222222222'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'heritage.auctions@example.com',
  '$2a$10$X0lNZnBwfvfUzOOFhz3LCe4GJJ7aGMZJGJQm7ZJ2JYzWy8gKdQ1z6', -- password: admin123
  now(),
  now(),
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"auctioneer"}',
  false,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null
),
(
  '33333333-3333-3333-3333-333333333333'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'sothebys.demo@example.com',
  '$2a$10$X0lNZnBwfvfUzOOFhz3LCe4GJJ7aGMZJGJQm7ZJ2JYzWy8gKdQ1z6', -- password: admin123
  now(),
  now(),
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"auctioneer"}',
  false,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null
),
(
  '44444444-4444-4444-4444-444444444444'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'alice.bidder@example.com',
  '$2a$10$X0lNZnBwfvfUzOOFhz3LCe4GJJ7aGMZJGJQm7ZJ2JYzWy8gKdQ1z6', -- password: admin123
  now(),
  now(),
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"bidder"}',
  false,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null
),
(
  '55555555-5555-5555-5555-555555555555'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'bob.collector@example.com',
  '$2a$10$X0lNZnBwfvfUzOOFhz3LCe4GJJ7aGMZJGJQm7ZJ2JYzWy8gKdQ1z6', -- password: admin123
  now(),
  now(),
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"bidder"}',
  false,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = now();

-- Create users in our users table
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('11111111-1111-1111-1111-111111111111', 'admin@imaginethisauction.com', 'admin', 'Platform', 'Admin', true),
('22222222-2222-2222-2222-222222222222', 'heritage.auctions@example.com', 'auctioneer', 'Heritage', 'Auctions', true),
('33333333-3333-3333-3333-333333333333', 'sothebys.demo@example.com', 'auctioneer', 'Sothebys', 'Demo', true),
('44444444-4444-4444-4444-444444444444', 'alice.bidder@example.com', 'bidder', 'Alice', 'Johnson', true),
('55555555-5555-5555-5555-555555555555', 'bob.collector@example.com', 'bidder', 'Bob', 'Smith', true)
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_approved = EXCLUDED.is_approved;

-- Create auctioneer companies
INSERT INTO auctioneers (id, user_id, company_name, business_license, address_line1, city, state, zip_code, is_approved, approval_date, organization_name, slug) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Heritage Auctions', 'GA-HERITAGE-001', '3500 Maple Avenue', 'Dallas', 'TX', '75219', true, NOW(), 'Heritage Auctions', 'heritage-auctions'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'Sotheby''s Demo', 'NY-SOTHEBYS-001', '1334 York Avenue', 'New York', 'NY', '10021', true, NOW(), 'Sotheby''s Demo', 'sothebys-demo')
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  is_approved = EXCLUDED.is_approved,
  organization_name = EXCLUDED.organization_name,
  slug = EXCLUDED.slug;

-- Create demo auctions
INSERT INTO auctions (id, auctioneer_id, title, description, starts_at, ends_at, status, buyer_premium_percent) VALUES
-- Live auctions
('live0001-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fine Art & Antiques', 'A curated selection of fine art, antiques, and decorative objects from private collections and estates.', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '4 hours', 'live', 10.00),
('live0002-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Modern & Contemporary Art', 'Contemporary paintings, sculptures, and mixed media works by emerging and established artists.', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '6 hours', 'live', 12.00),
('live0003-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Luxury Watches & Jewelry', 'Vintage and modern timepieces from prestigious brands, plus fine jewelry collection.', NOW() - INTERVAL '30 minutes', NOW() + INTERVAL '3 hours', 'live', 8.00),

-- Upcoming auctions
('upcoming1-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Asian Art & Ceramics', 'Rare Chinese porcelain, Japanese woodblock prints, and Southeast Asian sculptures.', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 'scheduled', 10.00),
('upcoming2-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vintage Automobiles', 'Classic cars from the 1950s-1980s, including European sports cars and American muscle cars.', NOW() + INTERVAL '3 days', NOW() + INTERVAL '4 days', 'scheduled', 5.00)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

-- Create demo lots for live auctions
INSERT INTO lots (id, auction_id, lot_number, title, description, starting_bid, reserve_price, increment, current_high_bid, bid_count, category, estimate_low, estimate_high, images) VALUES
-- Fine Art & Antiques Auction
('lot00001-1111-1111-1111-111111111111', 'live0001-1111-1111-1111-111111111111', 1, 'Oil on Canvas - Impressionist Landscape', 'Beautiful 19th century impressionist landscape painting, oil on canvas, unsigned but attributed to regional artist. Frame included.', 50000, 75000, 2500, 87500, 6, 'Fine Art', 75000, 125000, '["https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500"]'),
('lot00002-2222-2222-2222-222222222222', 'live0001-1111-1111-1111-111111111111', 2, 'Victorian Mahogany Dining Set', 'Complete Victorian dining room set including table, 8 chairs, and matching sideboard. Circa 1880s, excellent condition.', 35000, null, 1000, 42000, 8, 'Furniture', 40000, 60000, '["https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=500"]'),
('lot00003-3333-3333-3333-333333333333', 'live0001-1111-1111-1111-111111111111', 3, 'Pair of Chinese Export Porcelain Vases', 'Matched pair of Chinese export porcelain vases with famille rose decoration. Qing Dynasty, 18th century.', 25000, 35000, 1000, 38000, 4, 'Ceramics', 35000, 55000, '["https://images.unsplash.com/photo-1578662015141-14b4c8027c2c?w=500"]'),
('lot00004-4444-4444-4444-444444444444', 'live0001-1111-1111-1111-111111111111', 4, 'Art Deco Bronze Sculpture', 'Stunning Art Deco bronze figure of a dancer, signed by the artist. Original patina, mounted on marble base.', 15000, 22000, 500, 24500, 7, 'Sculpture', 22000, 35000, '["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500"]'),
('lot00005-5555-5555-5555-555555555555', 'live0001-1111-1111-1111-111111111111', 5, 'Persian Silk Carpet', 'Hand-knotted Persian silk carpet from Isfahan region. Intricate floral patterns with gold and blue highlights. 8x12 feet.', 45000, 65000, 2000, 71000, 5, 'Textiles', 65000, 95000, '["https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500"]'),

-- Modern & Contemporary Art Auction
('mod00001-1111-1111-1111-111111111111', 'live0002-2222-2222-2222-222222222222', 1, 'Abstract Expressionist Painting', 'Large scale abstract expressionist work in acrylic on canvas. Vibrant colors and dynamic brushwork characteristic of the movement.', 75000, 100000, 5000, 125000, 9, 'Modern Art', 100000, 150000, '["https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500"]'),
('mod00002-2222-2222-2222-222222222222', 'live0002-2222-2222-2222-222222222222', 2, 'Contemporary Mixed Media Sculpture', 'Innovative mixed media sculpture combining steel, glass, and found objects. Created by emerging contemporary artist.', 30000, 45000, 1500, 52500, 6, 'Contemporary Art', 45000, 70000, '["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500"]'),
('mod00003-3333-3333-3333-333333333333', 'live0002-2222-2222-2222-222222222222', 3, 'Digital Art Print - Limited Edition', 'Limited edition digital art print (25/100) by renowned digital artist. Archival pigment print on museum-quality paper.', 8000, null, 250, 12500, 12, 'Digital Art', 10000, 18000, '["https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=500"]'),

-- Luxury Watches & Jewelry Auction
('watch001-1111-1111-1111-111111111111', 'live0003-3333-3333-3333-333333333333', 1, 'Rolex Submariner - Vintage 1970s', 'Rolex Submariner ref. 5513, circa 1975. Original dial and hands, recently serviced. Complete with box and papers.', 120000, 150000, 5000, 165000, 11, 'Watches', 150000, 200000, '["https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=500"]'),
('watch002-2222-2222-2222-222222222222', 'live0003-3333-3333-3333-333333333333', 2, 'Patek Philippe Calatrava', 'Patek Philippe Calatrava ref. 5296G in white gold. Manual wind movement, elegant dress watch with original leather strap.', 250000, 300000, 10000, 340000, 7, 'Watches', 300000, 400000, '["https://images.unsplash.com/photo-1594534475808-b18fc33b045e?w=500"]'),
('jewelry01-1111-1111-1111-111111111111', 'live0003-3333-3333-3333-333333333333', 3, 'Diamond Tennis Bracelet', '18K white gold tennis bracelet set with 47 round brilliant cut diamonds totaling approximately 15 carats. VVS clarity, F-G color.', 180000, 220000, 8000, 236000, 8, 'Jewelry', 220000, 280000, '["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500"]')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  current_high_bid = EXCLUDED.current_high_bid,
  bid_count = EXCLUDED.bid_count;

-- Create lots for upcoming auctions (no bids yet)
INSERT INTO lots (id, auction_id, lot_number, title, description, starting_bid, reserve_price, increment, category, estimate_low, estimate_high, images) VALUES
-- Asian Art & Ceramics
('asian001-1111-1111-1111-111111111111', 'upcoming1-1111-1111-1111-111111111111', 1, 'Ming Dynasty Blue & White Vase', 'Rare Ming Dynasty blue and white porcelain vase with dragon motif. Xuande period mark, museum provenance.', 200000, 300000, 15000, 'Ceramics', 300000, 500000, '["https://images.unsplash.com/photo-1578662015141-14b4c8027c2c?w=500"]'),
('asian002-2222-2222-2222-222222222222', 'upcoming1-1111-1111-1111-111111111111', 2, 'Japanese Woodblock Print Set', 'Complete set of Hokusai''s "Thirty-six Views of Mount Fuji" original woodblock prints. Edo period, excellent condition.', 150000, 200000, 10000, 'Prints', 200000, 350000, '["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=500"]'),

-- Vintage Automobiles
('car00001-1111-1111-1111-111111111111', 'upcoming2-2222-2222-2222-222222222222', 1, '1967 Ferrari 275 GTB/4', 'Matching numbers 1967 Ferrari 275 GTB/4 in Rosso Corsa. Recently restored, concours condition with extensive documentation.', 2500000, 3000000, 100000, 'Automobiles', 3000000, 4000000, '["https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=500"]'),
('car00002-2222-2222-2222-222222222222', 'upcoming2-2222-2222-2222-222222222222', 2, '1970 Plymouth ''Cuda 440', 'Numbers matching 1970 Plymouth ''Cuda with 440 Six Pack engine. In-Violet paint, original interior, documented restoration.', 800000, 1000000, 25000, 'Automobiles', 1000000, 1400000, '["https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=500"]')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description;

-- Create sample bids for live auctions
INSERT INTO bids (id, lot_id, bidder_id, amount, is_winning, created_at) VALUES
-- Bids for Fine Art & Antiques
('bid00001-1111-1111-1111-111111111111', 'lot00001-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 50000, false, NOW() - INTERVAL '2 hours'),
('bid00002-2222-2222-2222-222222222222', 'lot00001-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 55000, false, NOW() - INTERVAL '90 minutes'),
('bid00003-3333-3333-3333-333333333333', 'lot00001-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 65000, false, NOW() - INTERVAL '60 minutes'),
('bid00004-4444-4444-4444-444444444444', 'lot00001-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 75000, false, NOW() - INTERVAL '45 minutes'),
('bid00005-5555-5555-5555-555555555555', 'lot00001-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 82500, false, NOW() - INTERVAL '20 minutes'),
('bid00006-6666-6666-6666-666666666666', 'lot00001-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 87500, true, NOW() - INTERVAL '10 minutes'),

-- More bids for other lots...
('bid00007-7777-7777-7777-777777777777', 'lot00002-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 35000, false, NOW() - INTERVAL '100 minutes'),
('bid00008-8888-8888-8888-888888888888', 'lot00002-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 38000, false, NOW() - INTERVAL '80 minutes'),
('bid00009-9999-9999-9999-999999999999', 'lot00002-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 42000, true, NOW() - INTERVAL '25 minutes')
ON CONFLICT (id) DO NOTHING;

-- Add wallet credits for bidders
INSERT INTO wallet_ledger (id, user_id, transaction_type, amount, balance_after, description, created_at) VALUES
('wallet01-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'purchase', 50000000, 50000000, 'Initial credit purchase - $5,000', NOW() - INTERVAL '1 day'),
('wallet02-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'purchase', 75000000, 75000000, 'Initial credit purchase - $7,500', NOW() - INTERVAL '1 day'),

-- Add bid holds for current winning bids
('wallet03-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'bid_hold', -8750000, 66250000, 'Bid hold for Fine Art lot #1', NOW() - INTERVAL '10 minutes'),
('wallet04-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'bid_hold', -4200000, 45800000, 'Bid hold for Fine Art lot #2', NOW() - INTERVAL '25 minutes')
ON CONFLICT (id) DO NOTHING;