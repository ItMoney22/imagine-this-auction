#!/usr/bin/env tsx
/**
 * Seed script for ImagineThisAuction platform
 * Creates test auctions and lots for development/testing
 *
 * This script requires the database schema to be applied first.
 * If tables don't exist, it will output SQL that can be run in the Supabase SQL Editor.
 *
 * Usage: npx tsx scripts/seed-auctions.ts
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database'

// Supabase connection - using provided credentials
const SUPABASE_URL = 'https://yhfelrmpwkzvnruubklx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZmVscm1wd2t6dm5ydXVia2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTA2OTAsImV4cCI6MjA4NTI2NjY5MH0.41ZrbPM_kuEr5ojy4FCgACmL6NqIfIgsyD-qNb-sYfs'

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)

// Helper functions for dates
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

// Static UUIDs for reproducible seeding
const TEST_USER_ID = '00000000-seed-user-0000-000000000001'
const TEST_AUCTIONEER_ID = '00000000-seed-auct-0000-000000000001'
const LIVE_AUCTION_ID = '00000000-seed-live-0000-000000000001'
const SCHEDULED_AUCTION_ID = '00000000-seed-schd-0000-000000000001'

async function checkTablesExist(): Promise<boolean> {
  console.log('Checking if database tables exist...')

  const { data, error } = await supabase
    .from('auctioneers')
    .select('id')
    .limit(1)

  if (error && error.message.includes('Could not find')) {
    return false
  }

  return true
}

function generateSeedSQL(): string {
  const now = new Date().toISOString()
  const oneHourAgo = hoursAgo(1)
  const twentyFourHoursFromNow = hoursFromNow(24)
  const twoDaysFromNow = daysFromNow(2)
  const fourDaysFromNow = daysFromNow(4)

  return `
-- =============================================================================
-- ImagineThisAuction Seed Data
-- Generated: ${now}
--
-- IMPORTANT: Run the schema migration FIRST before running this seed data.
-- The schema migration is located at: supabase/migrations/0001_full_schema.sql
-- =============================================================================

-- First, disable RLS temporarily for seeding (requires superuser)
-- You may need to run these as a superuser or through Supabase dashboard

-- Create test user (bypassing auth.users constraint for seeding)
-- Note: In production, users are created through Supabase Auth
INSERT INTO users (id, email, role, first_name, last_name, is_approved, created_at, updated_at) VALUES
('${TEST_USER_ID}', 'test-auctioneer@imaginethisauction.test', 'auctioneer', 'Test', 'Auctioneer', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_approved = EXCLUDED.is_approved;

-- Create auctioneer organization
INSERT INTO auctioneers (id, user_id, company_name, address_line1, city, state, zip_code, website, is_approved, approval_date, created_at, updated_at) VALUES
('${TEST_AUCTIONEER_ID}', '${TEST_USER_ID}', 'Test Auction House', '123 Auction Lane', 'Atlanta', 'GA', '30301', 'https://testauctions.example.com', true, NOW(), NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  is_approved = EXCLUDED.is_approved;

-- =============================================================================
-- AUCTION 1: Community Estate Sale (LIVE)
-- =============================================================================
INSERT INTO auctions (id, auctioneer_id, title, description, status, starts_at, ends_at, buyer_premium_percent, anti_sniping_seconds, created_at, updated_at) VALUES
('${LIVE_AUCTION_ID}', '${TEST_AUCTIONEER_ID}',
 'Community Estate Sale',
 'A wonderful collection of household treasures, vintage finds, and collectibles from a local family. Something for everyone!',
 'live',
 '${oneHourAgo}',
 '${twentyFourHoursFromNow}',
 10.00, 60, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- Lots for Community Estate Sale
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('${LIVE_AUCTION_ID}', 1, 'Canon AE-1 Program 35mm Film Camera',
 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual. Perfect for photography enthusiasts or vintage collectors.',
 7500, 500, 10000, 15000, 'Electronics', '["\/lots\/camera-vintage.webp"]'),

('${LIVE_AUCTION_ID}', 2, 'Classic Rock & Jazz Vinyl Collection (25 LPs)',
 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more. All in VG+ to NM condition with original sleeves.',
 12000, 1000, 20000, 30000, 'Music', '["\/lots\/vinyl-records.webp"]'),

('${LIVE_AUCTION_ID}', 3, 'Handcrafted Oak Rocking Chair, c.1920',
 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms and spindle back. Minor wear consistent with age.',
 15000, 1000, 25000, 40000, 'Furniture', '["\/lots\/rocking-chair.webp"]'),

('${LIVE_AUCTION_ID}', 4, 'Vintage Baseball Memorabilia Lot',
 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball. Cards are in good to excellent condition. Great starter collection!',
 5000, 500, 8000, 15000, 'Sports', '["\/lots\/sports-memorabilia.webp"]'),

('${LIVE_AUCTION_ID}', 5, '1960s Tin Toy Robot & Vintage Games',
 'Nostalgic collection of classic toys including battery-operated tin robot, wooden building blocks, and vintage board games. Robot is in working condition!',
 8000, 500, 12000, 20000, 'Toys', '["\/lots\/vintage-toys.webp"]'),

('${LIVE_AUCTION_ID}', 6, 'Artisan Ceramic Bowl & Vase Collection',
 'Set of 5 hand-thrown pottery pieces by local artist. Earth-toned glazes, each piece unique. Includes 2 serving bowls, 2 vases, and 1 decorative plate.',
 6000, 500, 10000, 18000, 'Art', '["\/lots\/pottery-handmade.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- =============================================================================
-- AUCTION 2: Vintage Collectors Showcase (SCHEDULED)
-- =============================================================================
INSERT INTO auctions (id, auctioneer_id, title, description, status, starts_at, ends_at, buyer_premium_percent, anti_sniping_seconds, created_at, updated_at) VALUES
('${SCHEDULED_AUCTION_ID}', '${TEST_AUCTIONEER_ID}',
 'Vintage Collectors Showcase',
 'Curated vintage items for collectors and enthusiasts. Preview available before bidding begins.',
 'scheduled',
 '${twoDaysFromNow}',
 '${fourDaysFromNow}',
 12.00, 60, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- Lots for Vintage Collectors Showcase
INSERT INTO lots (auction_id, lot_number, title, description, starting_bid, increment, estimate_low, estimate_high, category, images) VALUES
('${SCHEDULED_AUCTION_ID}', 1, 'Vintage Remington Typewriter, c.1950',
 'Beautifully preserved Remington typewriter from the mid-century era. Fully functional with smooth key action. Includes original carrying case and fresh ribbon.',
 9000, 500, 12000, 18000, 'Antiques', '["\/lots\/vintage-typewriter.webp"]'),

('${SCHEDULED_AUCTION_ID}', 2, 'Antique Gold Pocket Watch, c.1890',
 'Elegant gold-filled pocket watch with intricate engraving on case. Swiss movement, keeps excellent time. Includes original chain and presentation box.',
 25000, 2500, 35000, 50000, 'Jewelry', '["\/lots\/pocket-watch.webp"]'),

('${SCHEDULED_AUCTION_ID}', 3, 'Mid-Century Modern Arc Floor Lamp',
 'Iconic arching floor lamp in brushed nickel finish. Original marble base, adjustable arm. Quintessential 1960s design piece in excellent condition.',
 18000, 1000, 28000, 40000, 'Furniture', '["\/lots\/arc-lamp.webp"]'),

('${SCHEDULED_AUCTION_ID}', 4, 'Vintage Leather Suitcase Set (3 Pieces)',
 'Matched set of three vintage leather suitcases from the 1940s. Beautiful patina, brass hardware, silk-lined interiors. Perfect for display or travel enthusiasts.',
 12000, 1000, 18000, 28000, 'Collectibles', '["\/lots\/vintage-suitcases.webp"]')
ON CONFLICT (auction_id, lot_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_bid = EXCLUDED.starting_bid;

-- =============================================================================
-- Verification Queries (run these to confirm data was inserted)
-- =============================================================================
-- SELECT 'Auctioneers' as table_name, COUNT(*) as count FROM auctioneers
-- UNION ALL
-- SELECT 'Auctions', COUNT(*) FROM auctions
-- UNION ALL
-- SELECT 'Lots', COUNT(*) FROM lots;

-- SELECT a.title as auction, COUNT(l.id) as lot_count
-- FROM auctions a
-- LEFT JOIN lots l ON l.auction_id = a.id
-- GROUP BY a.title;
`.trim()
}

async function getOrCreateAuctioneer(): Promise<string> {
  console.log('Checking for existing auctioneer...')

  // Check for existing auctioneer
  const { data: existingAuctioneers, error: fetchError } = await supabase
    .from('auctioneers')
    .select('id, company_name')
    .limit(1)

  if (fetchError) {
    console.error('Error fetching auctioneers:', fetchError.message)
    throw fetchError
  }

  if (existingAuctioneers && existingAuctioneers.length > 0) {
    console.log(`Found existing auctioneer: ${existingAuctioneers[0].company_name}`)
    return existingAuctioneers[0].id
  }

  // No auctioneer exists, try to create one
  console.log('No auctioneer found, creating test auctioneer...')

  // First, try to find any existing user we can use
  const { data: anyUser, error: userError } = await supabase
    .from('users')
    .select('id')
    .limit(1)

  let userId: string

  if (userError || !anyUser || anyUser.length === 0) {
    // Try to create a test user (may fail due to auth constraints)
    const { data: newUser, error: createUserError } = await supabase
      .from('users')
      .insert({
        id: TEST_USER_ID,
        email: 'test-auctioneer@imaginethisauction.test',
        role: 'auctioneer',
        first_name: 'Test',
        last_name: 'Auctioneer',
        is_approved: true
      })
      .select('id')
      .single()

    if (createUserError) {
      console.error('Could not create user:', createUserError.message)
      throw new Error('Cannot create auctioneer: no users exist and cannot create new user')
    }

    userId = newUser.id
    console.log('Created new user:', userId)
  } else {
    userId = anyUser[0].id
    console.log('Using existing user ID:', userId)
  }

  // Create the auctioneer
  const { data: auctioneer, error: auctioneerError } = await supabase
    .from('auctioneers')
    .insert({
      user_id: userId,
      company_name: 'Test Auction House',
      address_line1: '123 Auction Lane',
      city: 'Atlanta',
      state: 'GA',
      zip_code: '30301',
      website: 'https://testauctions.example.com',
      is_approved: true,
      approval_date: new Date().toISOString()
    })
    .select('id')
    .single()

  if (auctioneerError) {
    console.error('Error creating auctioneer:', auctioneerError.message)
    throw auctioneerError
  }

  console.log('Created new auctioneer:', auctioneer.id)
  return auctioneer.id
}

async function seedAuctions(auctioneerId: string): Promise<{ liveAuctionId: string; scheduledAuctionId: string }> {
  console.log('\nCreating auctions...')

  // Auction 1: Community Estate Sale (Live)
  const { data: liveAuction, error: liveError } = await supabase
    .from('auctions')
    .insert({
      auctioneer_id: auctioneerId,
      title: 'Community Estate Sale',
      description: 'A wonderful collection of household treasures, vintage finds, and collectibles from a local family. Something for everyone!',
      status: 'live',
      starts_at: hoursAgo(1),
      ends_at: hoursFromNow(24),
      buyer_premium_percent: 10,
      anti_sniping_seconds: 60
    })
    .select('id')
    .single()

  if (liveError) {
    console.error('Error creating live auction:', liveError.message)
    throw liveError
  }

  console.log(`Created live auction: "Community Estate Sale" (ID: ${liveAuction.id})`)

  // Auction 2: Vintage Collectors Showcase (Scheduled)
  const { data: scheduledAuction, error: scheduledError } = await supabase
    .from('auctions')
    .insert({
      auctioneer_id: auctioneerId,
      title: 'Vintage Collectors Showcase',
      description: 'Curated vintage items for collectors and enthusiasts. Preview available before bidding begins.',
      status: 'scheduled',
      starts_at: daysFromNow(2),
      ends_at: daysFromNow(4),
      buyer_premium_percent: 12,
      anti_sniping_seconds: 60
    })
    .select('id')
    .single()

  if (scheduledError) {
    console.error('Error creating scheduled auction:', scheduledError.message)
    throw scheduledError
  }

  console.log(`Created scheduled auction: "Vintage Collectors Showcase" (ID: ${scheduledAuction.id})`)

  return {
    liveAuctionId: liveAuction.id,
    scheduledAuctionId: scheduledAuction.id
  }
}

async function seedLotsForLiveAuction(auctionId: string): Promise<void> {
  console.log('\nCreating lots for Community Estate Sale...')

  const lots = [
    {
      auction_id: auctionId,
      lot_number: 1,
      title: 'Canon AE-1 Program 35mm Film Camera',
      description: 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual. Perfect for photography enthusiasts or vintage collectors.',
      starting_bid: 7500,
      increment: 500,
      estimate_low: 10000,
      estimate_high: 15000,
      category: 'Electronics',
      images: ['/lots/camera-vintage.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 2,
      title: 'Classic Rock & Jazz Vinyl Collection (25 LPs)',
      description: 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more. All in VG+ to NM condition with original sleeves.',
      starting_bid: 12000,
      increment: 1000,
      estimate_low: 20000,
      estimate_high: 30000,
      category: 'Music',
      images: ['/lots/vinyl-records.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 3,
      title: 'Handcrafted Oak Rocking Chair, c.1920',
      description: 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms and spindle back. Minor wear consistent with age.',
      starting_bid: 15000,
      increment: 1000,
      estimate_low: 25000,
      estimate_high: 40000,
      category: 'Furniture',
      images: ['/lots/rocking-chair.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 4,
      title: 'Vintage Baseball Memorabilia Lot',
      description: 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball. Cards are in good to excellent condition. Great starter collection!',
      starting_bid: 5000,
      increment: 500,
      estimate_low: 8000,
      estimate_high: 15000,
      category: 'Sports',
      images: ['/lots/sports-memorabilia.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 5,
      title: '1960s Tin Toy Robot & Vintage Games',
      description: 'Nostalgic collection of classic toys including battery-operated tin robot, wooden building blocks, and vintage board games. Robot is in working condition!',
      starting_bid: 8000,
      increment: 500,
      estimate_low: 12000,
      estimate_high: 20000,
      category: 'Toys',
      images: ['/lots/vintage-toys.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 6,
      title: 'Artisan Ceramic Bowl & Vase Collection',
      description: 'Set of 5 hand-thrown pottery pieces by local artist. Earth-toned glazes, each piece unique. Includes 2 serving bowls, 2 vases, and 1 decorative plate.',
      starting_bid: 6000,
      increment: 500,
      estimate_low: 10000,
      estimate_high: 18000,
      category: 'Art',
      images: ['/lots/pottery-handmade.webp']
    }
  ]

  const { data: insertedLots, error } = await supabase
    .from('lots')
    .insert(lots)
    .select('id, lot_number, title')

  if (error) {
    console.error('Error creating lots:', error.message)
    throw error
  }

  console.log(`Created ${insertedLots.length} lots:`)
  insertedLots.forEach(lot => {
    console.log(`  Lot ${lot.lot_number}: ${lot.title}`)
  })
}

async function seedLotsForScheduledAuction(auctionId: string): Promise<void> {
  console.log('\nCreating lots for Vintage Collectors Showcase...')

  const lots = [
    {
      auction_id: auctionId,
      lot_number: 1,
      title: 'Vintage Remington Typewriter, c.1950',
      description: 'Beautifully preserved Remington typewriter from the mid-century era. Fully functional with smooth key action. Includes original carrying case and fresh ribbon.',
      starting_bid: 9000,
      increment: 500,
      estimate_low: 12000,
      estimate_high: 18000,
      category: 'Antiques',
      images: ['/lots/vintage-typewriter.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 2,
      title: 'Antique Gold Pocket Watch, c.1890',
      description: 'Elegant gold-filled pocket watch with intricate engraving on case. Swiss movement, keeps excellent time. Includes original chain and presentation box.',
      starting_bid: 25000,
      increment: 2500,
      estimate_low: 35000,
      estimate_high: 50000,
      category: 'Jewelry',
      images: ['/lots/pocket-watch.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 3,
      title: 'Mid-Century Modern Arc Floor Lamp',
      description: 'Iconic arching floor lamp in brushed nickel finish. Original marble base, adjustable arm. Quintessential 1960s design piece in excellent condition.',
      starting_bid: 18000,
      increment: 1000,
      estimate_low: 28000,
      estimate_high: 40000,
      category: 'Furniture',
      images: ['/lots/arc-lamp.webp']
    },
    {
      auction_id: auctionId,
      lot_number: 4,
      title: 'Vintage Leather Suitcase Set (3 Pieces)',
      description: 'Matched set of three vintage leather suitcases from the 1940s. Beautiful patina, brass hardware, silk-lined interiors. Perfect for display or travel enthusiasts.',
      starting_bid: 12000,
      increment: 1000,
      estimate_low: 18000,
      estimate_high: 28000,
      category: 'Collectibles',
      images: ['/lots/vintage-suitcases.webp']
    }
  ]

  const { data: insertedLots, error } = await supabase
    .from('lots')
    .insert(lots)
    .select('id, lot_number, title')

  if (error) {
    console.error('Error creating lots:', error.message)
    throw error
  }

  console.log(`Created ${insertedLots.length} lots:`)
  insertedLots.forEach(lot => {
    console.log(`  Lot ${lot.lot_number}: ${lot.title}`)
  })
}

async function main(): Promise<void> {
  console.log('=' .repeat(60))
  console.log('ImagineThisAuction - Database Seeder')
  console.log('=' .repeat(60))
  console.log()

  // First check if tables exist
  const tablesExist = await checkTablesExist()

  if (!tablesExist) {
    console.log('\n' + '!' .repeat(60))
    console.log('DATABASE TABLES NOT FOUND!')
    console.log('!' .repeat(60))
    console.log('\nThe database schema has not been applied yet.')
    console.log('Please run the following steps:')
    console.log('\n1. Go to your Supabase dashboard:')
    console.log('   https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx')
    console.log('\n2. Navigate to SQL Editor')
    console.log('\n3. First, run the schema migration from:')
    console.log('   supabase/migrations/0001_full_schema.sql')
    console.log('\n4. Then run this seed SQL:\n')
    console.log('-' .repeat(60))
    console.log(generateSeedSQL())
    console.log('-' .repeat(60))
    console.log('\nAlternatively, copy the seed SQL above and paste it into the SQL Editor.')
    process.exit(1)
  }

  try {
    // Step 1: Get or create auctioneer
    const auctioneerId = await getOrCreateAuctioneer()

    // Step 2: Create auctions
    const { liveAuctionId, scheduledAuctionId } = await seedAuctions(auctioneerId)

    // Step 3: Create lots for live auction
    await seedLotsForLiveAuction(liveAuctionId)

    // Step 4: Create lots for scheduled auction
    await seedLotsForScheduledAuction(scheduledAuctionId)

    console.log('\n' + '=' .repeat(60))
    console.log('SEED COMPLETED SUCCESSFULLY')
    console.log('=' .repeat(60))
    console.log('\nSummary:')
    console.log('  - 1 Auctioneer (existing or newly created)')
    console.log('  - 2 Auctions:')
    console.log('      - "Community Estate Sale" (LIVE)')
    console.log('      - "Vintage Collectors Showcase" (SCHEDULED)')
    console.log('  - 10 Total Lots:')
    console.log('      - 6 lots in live auction')
    console.log('      - 4 lots in scheduled auction')
    console.log('\nPrices are in ITC cents (e.g., 7500 = $75.00)')
    console.log()

  } catch (error) {
    console.error('\nSEED FAILED:', error)
    process.exit(1)
  }
}

main()
