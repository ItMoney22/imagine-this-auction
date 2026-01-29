-- ImagineThisAuction - Seed Data
-- Task B: Schema & Migrations

-- Note: This script assumes you have created Supabase auth users first
-- You'll need to replace the UUID values with actual auth.users IDs

-- ==========================================
-- SEED USERS
-- ==========================================

-- Create admin user (replace with actual auth.users ID)
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('11111111-1111-1111-1111-111111111111', 'admin@imaginethisauction.com', 'admin', 'System', 'Administrator', true);

-- Create auctioneer user (replace with actual auth.users ID)
INSERT INTO users (id, email, role, first_name, last_name, phone, is_approved) VALUES
('22222222-2222-2222-2222-222222222222', 'heritage@auctions.com', 'auctioneer', 'Robert', 'Heritage', '555-0123', true);

-- Create test bidder users (replace with actual auth.users IDs)
INSERT INTO users (id, email, role, first_name, last_name, is_approved) VALUES
('33333333-3333-3333-3333-333333333333', 'bidder1@test.com', 'bidder', 'Alice', 'Johnson', true),
('44444444-4444-4444-4444-444444444444', 'bidder2@test.com', 'bidder', 'Bob', 'Smith', true),
('55555555-5555-5555-5555-555555555555', 'bidder3@test.com', 'bidder', 'Carol', 'Wilson', true),
('66666666-6666-6666-6666-666666666666', 'bidder4@test.com', 'bidder', 'David', 'Brown', true),
('77777777-7777-7777-7777-777777777777', 'bidder5@test.com', 'bidder', 'Emma', 'Davis', true);

-- ==========================================
-- SEED AUCTIONEER
-- ==========================================

INSERT INTO auctioneers (
    id,
    user_id,
    company_name,
    business_license,
    tax_id,
    address_line1,
    city,
    state,
    zip_code,
    website,
    is_approved,
    approval_date
) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'Heritage Auctions LLC',
    'GA-AUCTION-2024-001',
    '58-1234567',
    '123 Main Street',
    'Atlanta',
    'GA',
    '30309',
    'https://heritageauctions.example.com',
    true,
    now()
);

-- ==========================================
-- SEED AUCTIONS
-- ==========================================

-- Live auction - Fine Art Collection
INSERT INTO auctions (
    id,
    auctioneer_id,
    title,
    description,
    starts_at,
    ends_at,
    status,
    buyer_premium_percent,
    anti_sniping_seconds,
    terms_and_conditions
) VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Fine Art Collection - Estate Sale',
    'A curated collection of fine art from a prominent Atlanta estate, featuring works from the 19th and 20th centuries.',
    now() - interval '1 hour',
    now() + interval '6 hours',
    'live',
    10.00,
    60,
    'All sales final. 10% buyer''s premium applies. Items must be paid within 48 hours of auction close.'
);

-- Scheduled auction - Vintage Watches
INSERT INTO auctions (
    id,
    auctioneer_id,
    title,
    description,
    starts_at,
    ends_at,
    status,
    buyer_premium_percent,
    anti_sniping_seconds,
    terms_and_conditions
) VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Vintage Watch Collection',
    'Rare and vintage timepieces from private collectors, including Rolex, Omega, and Patek Philippe.',
    now() + interval '1 day',
    now() + interval '2 days',
    'scheduled',
    12.00,
    60,
    'All watches sold as-is. Authentication certificates provided where available. 12% buyer''s premium applies.'
);

-- ==========================================
-- SEED LOTS - Fine Art Auction (Live)
-- ==========================================

INSERT INTO lots (
    id,
    auction_id,
    lot_number,
    title,
    description,
    starting_bid,
    reserve_price,
    increment,
    current_high_bid,
    bid_count,
    category,
    dimensions,
    estimate_low,
    estimate_high,
    images
) VALUES
-- Lot 1
('lot00001-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1,
 'Abstract Composition by Unknown Artist',
 'Oil on canvas, mid-20th century abstract work featuring bold geometric forms in blues and yellows.',
 50000, 75000, 2500, 67500, 4, 'Paintings',
 '24" x 36"', 75000, 100000,
 '["https://example.com/lot1-1.jpg", "https://example.com/lot1-2.jpg"]'::jsonb),

-- Lot 2
('lot00002-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2,
 'Victorian Portrait of a Lady',
 'Oil on canvas portrait, circa 1880, depicting an elegant lady in period dress.',
 25000, 35000, 1000, 32000, 6, 'Paintings',
 '18" x 24"', 35000, 50000,
 '["https://example.com/lot2-1.jpg"]'::jsonb),

-- Lot 3
('lot00003-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3,
 'Bronze Sculpture - Dancing Figure',
 'Early 20th century bronze sculpture of a dancing figure, signed at base.',
 15000, 20000, 500, 18500, 3, 'Sculpture',
 '12" H x 8" W x 6" D', 20000, 30000,
 '["https://example.com/lot3-1.jpg", "https://example.com/lot3-2.jpg"]'::jsonb),

-- Lot 4
('lot00004-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 4,
 'Set of 6 Antique Dining Chairs',
 'Mahogany dining chairs, circa 1920, with original upholstery in excellent condition.',
 8000, null, 250, 9750, 8, 'Furniture',
 '18" W x 20" D x 36" H (each)', 8000, 12000,
 '["https://example.com/lot4-1.jpg"]'::jsonb),

-- Lot 5
('lot00005-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5,
 'Chinese Porcelain Vase - Qing Dynasty',
 'Blue and white porcelain vase with traditional landscape motifs, Qing Dynasty period.',
 30000, 40000, 1500, 36000, 5, 'Ceramics',
 '14" H x 6" Diameter', 40000, 60000,
 '["https://example.com/lot5-1.jpg", "https://example.com/lot5-2.jpg"]'::jsonb),

-- Lot 6
('lot00006-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 6,
 'Art Deco Table Lamp',
 'Stunning Art Deco table lamp with original shade, circa 1925, bronze and glass construction.',
 4000, null, 200, 4800, 4, 'Decorative Arts',
 '18" H x 10" W', 5000, 8000,
 '["https://example.com/lot6-1.jpg"]'::jsonb),

-- Lot 7
('lot00007-7777-7777-7777-777777777777', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 7,
 'Landscape Oil Painting - Mountain Scene',
 'Impressionist-style landscape painting featuring mountain vista with lake, unsigned.',
 12000, 18000, 500, 14500, 3, 'Paintings',
 '20" x 30"', 15000, 25000,
 '["https://example.com/lot7-1.jpg"]'::jsonb),

-- Lot 8
('lot00008-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 8,
 'Persian Rug - Kashan',
 'Hand-knotted Persian Kashan rug, wool on cotton, traditional floral pattern.',
 20000, null, 1000, 23000, 4, 'Textiles',
 "9'6\" x 13'2\"", 25000, 35000,
 '["https://example.com/lot8-1.jpg", "https://example.com/lot8-2.jpg"]'::jsonb),

-- Lot 9
('lot00009-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 9,
 'Crystal Chandelier - Baccarat Style',
 'Multi-tiered crystal chandelier in the style of Baccarat, 20th century.',
 6000, 8000, 300, 7200, 6, 'Lighting',
 '30" H x 24" Diameter', 8000, 12000,
 '["https://example.com/lot9-1.jpg"]'::jsonb),

-- Lot 10
('lot00010-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 10,
 'Antique Mahogany Secretary Desk',
 'George III mahogany secretary desk with bookcase top, circa 1800.',
 35000, 45000, 1500, 38500, 2, 'Furniture',
 '36" W x 18" D x 84" H', 45000, 65000,
 '["https://example.com/lot10-1.jpg", "https://example.com/lot10-2.jpg"]'::jsonb);

-- ==========================================
-- SEED LOTS - Vintage Watch Auction (Scheduled)
-- ==========================================

INSERT INTO lots (
    id,
    auction_id,
    lot_number,
    title,
    description,
    starting_bid,
    reserve_price,
    increment,
    category,
    estimate_low,
    estimate_high,
    images
) VALUES
-- Watch Lot 1
('watch001-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1,
 'Rolex Submariner Date - Ref. 16610',
 'Stainless steel Rolex Submariner with date, black dial and bezel, circa 1995.',
 800000, 1000000, 25000, 'Watches',
 1000000, 1300000,
 '["https://example.com/watch1-1.jpg", "https://example.com/watch1-2.jpg"]'::jsonb),

-- Watch Lot 2
('watch002-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 2,
 'Omega Speedmaster Professional',
 'Manual wind chronograph, moon watch, with original box and papers.',
 350000, 450000, 10000, 'Watches',
 450000, 650000,
 '["https://example.com/watch2-1.jpg"]'::jsonb),

-- Watch Lot 3
('watch003-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 3,
 'Patek Philippe Calatrava',
 'Yellow gold dress watch with small seconds, ref. 3919, excellent condition.',
 1500000, 2000000, 50000, 'Watches',
 2000000, 2800000,
 '["https://example.com/watch3-1.jpg", "https://example.com/watch3-2.jpg"]'::jsonb),

-- Watch Lot 4
('watch004-4444-4444-4444-444444444444', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 4,
 'Vintage Cartier Tank',
 'Art Deco Cartier Tank watch in yellow gold, manual wind, circa 1970.',
 200000, 250000, 5000, 'Watches',
 250000, 350000,
 '["https://example.com/watch4-1.jpg"]'::jsonb),

-- Watch Lot 5
('watch005-5555-5555-5555-555555555555', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 5,
 'Jaeger-LeCoultre Reverso',
 'Classic Reverso with flip case, stainless steel, black dial.',
 300000, 400000, 10000, 'Watches',
 400000, 550000,
 '["https://example.com/watch5-1.jpg", "https://example.com/watch5-2.jpg"]'::jsonb),

-- Watch Lot 6
('watch006-6666-6666-6666-666666666666', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 6,
 'Tudor Black Bay',
 'Modern Tudor Black Bay diving watch, excellent condition with box.',
 250000, null, 5000, 'Watches',
 300000, 400000,
 '["https://example.com/watch6-1.jpg"]'::jsonb),

-- Watch Lot 7
('watch007-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 7,
 'Breitling Navitimer',
 'Pilot''s chronograph with slide rule bezel, stainless steel.',
 400000, 500000, 15000, 'Watches',
 500000, 700000,
 '["https://example.com/watch7-1.jpg"]'::jsonb),

-- Watch Lot 8
('watch008-8888-8888-8888-888888888888', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 8,
 'Seiko Grand Seiko',
 'High-end Seiko Grand Seiko with spring drive movement.',
 150000, 200000, 5000, 'Watches',
 200000, 300000,
 '["https://example.com/watch8-1.jpg", "https://example.com/watch8-2.jpg"]'::jsonb),

-- Watch Lot 9
('watch009-9999-9999-9999-999999999999', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 9,
 'IWC Portuguese Chronograph',
 'Large case chronograph with white dial, automatic movement.',
 600000, 750000, 20000, 'Watches',
 750000, 950000,
 '["https://example.com/watch9-1.jpg"]'::jsonb),

-- Watch Lot 10
('watch010-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 10,
 'Vintage Heuer Monaco',
 'Square case chronograph made famous by Steve McQueen, circa 1970.',
 1000000, 1200000, 30000, 'Watches',
 1200000, 1600000,
 '["https://example.com/watch10-1.jpg", "https://example.com/watch10-2.jpg"]'::jsonb);

-- ==========================================
-- SEED BIDS (for live auction)
-- ==========================================

-- Bids for Lot 1 (Abstract Composition)
INSERT INTO bids (lot_id, bidder_id, amount, is_winning, created_at) VALUES
('lot00001-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 50000, false, now() - interval '2 hours'),
('lot00001-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 52500, false, now() - interval '1 hour 45 minutes'),
('lot00001-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 55000, false, now() - interval '1 hour 30 minutes'),
('lot00001-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 67500, true, now() - interval '30 minutes');

-- Bids for Lot 2 (Victorian Portrait)
INSERT INTO bids (lot_id, bidder_id, amount, is_winning, created_at) VALUES
('lot00002-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 25000, false, now() - interval '1 hour 20 minutes'),
('lot00002-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 26000, false, now() - interval '1 hour'),
('lot00002-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 28000, false, now() - interval '45 minutes'),
('lot00002-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 30000, false, now() - interval '30 minutes'),
('lot00002-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 31000, false, now() - interval '20 minutes'),
('lot00002-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 32000, true, now() - interval '15 minutes');

-- ==========================================
-- SEED WALLET LEDGER (ITC Credits)
-- ==========================================

-- Give bidders some ITC credits
INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description) VALUES
-- Alice Johnson - 100,000 ITC ($1,000)
('33333333-3333-3333-3333-333333333333', 'purchase', 10000000, 10000000, 'Initial credit purchase - $1,000'),
-- Bob Smith - 50,000 ITC ($500)
('44444444-4444-4444-4444-444444444444', 'purchase', 5000000, 5000000, 'Initial credit purchase - $500'),
-- Carol Wilson - 75,000 ITC ($750)
('55555555-5555-5555-5555-555555555555', 'purchase', 7500000, 7500000, 'Initial credit purchase - $750'),
-- David Brown - 25,000 ITC ($250)
('66666666-6666-6666-6666-666666666666', 'purchase', 2500000, 2500000, 'Initial credit purchase - $250'),
-- Emma Davis - 150,000 ITC ($1,500)
('77777777-7777-7777-7777-777777777777', 'purchase', 15000000, 15000000, 'Initial credit purchase - $1,500');

-- Simulate bid holds for active bids
INSERT INTO wallet_ledger (user_id, transaction_type, amount, balance_after, description, reference_type) VALUES
-- Alice's winning bid on Lot 1 (67,500)
('33333333-3333-3333-3333-333333333333', 'bid_hold', -6750000, 3250000, 'Bid placed on lot #1', 'bid'),
-- Bob's outbid refunds and current positions
('44444444-4444-4444-4444-444444444444', 'bid_hold', -2500000, 2500000, 'Bid placed on lot #1 (outbid)', 'bid'),
('44444444-4444-4444-4444-444444444444', 'bid_refund', 2500000, 5000000, 'Outbid refund for lot #1', 'bid'),
('44444444-4444-4444-4444-444444444444', 'bid_hold', -5250000, -250000, 'Bid placed on lot #1 (outbid)', 'bid'),
('44444444-4444-4444-4444-444444444444', 'bid_refund', 5250000, 5000000, 'Outbid refund for lot #1', 'bid'),
-- Emma's winning bid on Lot 2 (32,000)
('77777777-7777-7777-7777-777777777777', 'bid_hold', -3200000, 11800000, 'Bid placed on lot #2', 'bid');

-- ==========================================
-- HELPER: Update lot bid counts and high bids to match seed data
-- ==========================================

UPDATE lots SET
    current_high_bid = 67500,
    bid_count = 4
WHERE id = 'lot00001-1111-1111-1111-111111111111';

UPDATE lots SET
    current_high_bid = 32000,
    bid_count = 6
WHERE id = 'lot00002-2222-2222-2222-222222222222';

-- ==========================================
-- AUDIT LOG ENTRIES
-- ==========================================

INSERT INTO audit_log (user_id, action, table_name, record_id, new_values) VALUES
('11111111-1111-1111-1111-111111111111', 'SEED_DATA_CREATED', 'system', null, '{"message": "Initial seed data created", "timestamp": "' || now() || '"}');

-- Final status message
DO $$
BEGIN
    RAISE NOTICE 'Seed data created successfully!';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '- 6 users (1 admin, 1 auctioneer, 5 bidders)';
    RAISE NOTICE '- 1 auctioneer company (Heritage Auctions LLC)';
    RAISE NOTICE '- 2 auctions (1 live, 1 scheduled)';
    RAISE NOTICE '- 20 lots (10 fine art, 10 watches)';
    RAISE NOTICE '- Sample bids on live auction';
    RAISE NOTICE '- ITC wallet credits for all bidders';
    RAISE NOTICE '';
    RAISE NOTICE 'Remember to:';
    RAISE NOTICE '1. Replace UUID values with actual auth.users IDs';
    RAISE NOTICE '2. Update image URLs to real paths';
    RAISE NOTICE '3. Adjust timing for auctions as needed';
END $$;