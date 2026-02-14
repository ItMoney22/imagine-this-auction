/**
 * Seed Test Data for ImagineThisAuction
 *
 * Creates:
 * - 5 test users (1 admin, 1 auctioneer, 3 bidders)
 * - Auctioneer profile
 * - 1 live auction with 6 lots
 * - ITC wallet credits for bidders
 *
 * Run with: node seed-test-data.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from apps/web/.env.local
dotenv.config({ path: path.join(__dirname, 'apps', 'web', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test user data
const TEST_USERS = [
  {
    email: 'davidltrinidad@gmail.com',
    password: 'TestPass123!',
    role: 'admin',
    first_name: 'David',
    last_name: 'Trinidad',
    phone: '+1-555-0100'
  },
  {
    email: 'auctioneer@test.com',
    password: 'TestPass123!',
    role: 'auctioneer',
    first_name: 'Alice',
    last_name: 'Auctioneer',
    phone: '+1-555-0101'
  },
  {
    email: 'bidder1@test.com',
    password: 'TestPass123!',
    role: 'bidder',
    first_name: 'Bob',
    last_name: 'Bidder',
    phone: '+1-555-0201'
  },
  {
    email: 'bidder2@test.com',
    password: 'TestPass123!',
    role: 'bidder',
    first_name: 'Carol',
    last_name: 'Collector',
    phone: '+1-555-0202'
  },
  {
    email: 'bidder3@test.com',
    password: 'TestPass123!',
    role: 'bidder',
    first_name: 'Dan',
    last_name: 'Dealer',
    phone: '+1-555-0203'
  }
];

// Auction lots data - community-friendly items
const AUCTION_LOTS = [
  {
    lot_number: 1,
    title: 'Vintage Canon AE-1 Camera with 50mm Lens',
    description: 'Classic 35mm SLR camera from 1976 in excellent working condition. Comes with original Canon FD 50mm f/1.8 lens, leather case, and manual. Perfect for film photography enthusiasts.',
    starting_bid: 15000, // $150.00
    reserve_price: 20000, // $200.00
    increment: 500, // $5.00
    category: 'Photography',
    condition_report: 'Excellent condition, light meter working, shutter speeds accurate. Minor cosmetic wear consistent with age.',
    estimate_low: 15000,
    estimate_high: 25000
  },
  {
    lot_number: 2,
    title: 'Collection of Classic Rock Vinyl Records (25 Albums)',
    description: 'Curated collection of 1970s-80s rock albums including Led Zeppelin, Pink Floyd, The Beatles, and more. All in VG+ to NM condition.',
    starting_bid: 20000, // $200.00
    reserve_price: 30000, // $300.00
    increment: 1000, // $10.00
    category: 'Music',
    condition_report: 'Vinyl grades from VG+ to NM. Covers show minimal shelf wear. No skips or major scratches.',
    estimate_low: 25000,
    estimate_high: 40000
  },
  {
    lot_number: 3,
    title: 'Handcrafted Oak Rocking Chair (circa 1920)',
    description: 'Beautiful antique solid oak rocking chair with carved details. Original finish, recently restored. Comfortable and sturdy.',
    starting_bid: 12000, // $120.00
    reserve_price: 18000, // $180.00
    increment: 500, // $5.00
    category: 'Furniture',
    condition_report: 'Structurally sound, professionally cleaned and oiled. Minor age-appropriate wear on armrests.',
    provenance: 'Estate sale, New England family heirloom',
    estimate_low: 15000,
    estimate_high: 30000
  },
  {
    lot_number: 4,
    title: 'Signed Baseball Memorabilia Collection',
    description: 'Authenticated collection including signed baseballs, vintage baseball cards (1980s-90s), and framed team photo. Includes certificate of authenticity.',
    starting_bid: 25000, // $250.00
    reserve_price: 35000, // $350.00
    increment: 1000, // $10.00
    category: 'Sports Collectibles',
    condition_report: 'All items authenticated by PSA/DNA. Cards professionally graded, baseballs in protective cases.',
    estimate_low: 30000,
    estimate_high: 50000
  },
  {
    lot_number: 5,
    title: 'Vintage Star Wars Action Figures (Original Kenner 1977-1985)',
    description: 'Collection of 12 original Kenner Star Wars action figures in excellent condition with accessories. Includes Luke Skywalker, Darth Vader, Han Solo, and more.',
    starting_bid: 30000, // $300.00
    reserve_price: 40000, // $400.00
    increment: 1000, // $10.00
    category: 'Toys & Collectibles',
    condition_report: 'All figures complete with original accessories. Joints tight, paint excellent. No reproduction parts.',
    estimate_low: 35000,
    estimate_high: 60000
  },
  {
    lot_number: 6,
    title: 'Handmade Ceramic Pottery Set by Local Artist',
    description: 'Beautiful set of handcrafted stoneware pottery including serving bowls, dinner plates, and mugs. Unique glazing in earth tones. Set of 8 place settings.',
    starting_bid: 8000, // $80.00
    reserve_price: 12000, // $120.00
    increment: 500, // $5.00
    category: 'Art & Pottery',
    condition_report: 'Mint condition, never used. Food-safe, dishwasher safe glazes. Signed by artist.',
    provenance: 'Direct from artist studio',
    estimate_low: 10000,
    estimate_high: 20000
  }
];

async function createAuthUser(userData) {
  try {
    console.log(`Creating auth user: ${userData.email}...`);

    // Use Supabase Admin API to create user
    // Note: With anon key, we can only sign up users normally
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        data: {
          first_name: userData.first_name,
          last_name: userData.last_name
        }
      }
    });

    if (authError) {
      console.error(`Error creating auth user ${userData.email}:`, authError.message);
      return null;
    }

    if (!authData.user) {
      console.error(`No user returned for ${userData.email}`);
      return null;
    }

    console.log(`✓ Auth user created: ${userData.email} (ID: ${authData.user.id})`);
    return authData.user;
  } catch (error) {
    console.error(`Exception creating auth user ${userData.email}:`, error.message);
    return null;
  }
}

async function createPublicUser(authUser, userData) {
  try {
    console.log(`Creating public user record for: ${userData.email}...`);

    const { data, error } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        email: userData.email,
        role: userData.role,
        first_name: userData.first_name,
        last_name: userData.last_name,
        phone: userData.phone,
        is_approved: true // Auto-approve test users
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating public user ${userData.email}:`, error.message);
      return null;
    }

    console.log(`✓ Public user created: ${userData.email} (Role: ${userData.role})`);
    return data;
  } catch (error) {
    console.error(`Exception creating public user ${userData.email}:`, error.message);
    return null;
  }
}

async function createAuctioneerProfile(userId) {
  try {
    console.log('Creating auctioneer profile...');

    const { data, error } = await supabase
      .from('auctioneers')
      .insert({
        user_id: userId,
        company_name: 'Test Auction House',
        business_license: 'TEST-LIC-2024-001',
        tax_id: '12-3456789',
        address_line1: '123 Auction Street',
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        website: 'https://testauctions.example.com',
        is_approved: true,
        approval_date: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating auctioneer profile:', error.message);
      return null;
    }

    console.log(`✓ Auctioneer profile created (ID: ${data.id})`);
    return data;
  } catch (error) {
    console.error('Exception creating auctioneer profile:', error.message);
    return null;
  }
}

async function createAuction(auctioneerId) {
  try {
    console.log('Creating live auction...');

    const now = new Date();
    const startsAt = new Date(now.getTime() - 2 * 60 * 60 * 1000); // Started 2 hours ago
    const endsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000); // Ends in 6 hours

    const { data, error } = await supabase
      .from('auctions')
      .insert({
        auctioneer_id: auctioneerId,
        title: 'Community Collectibles & Treasures Auction',
        description: 'A carefully curated selection of vintage collectibles, antiques, and unique items from local estates and collectors. All items authenticated and ready for new homes!',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'live',
        buyer_premium_percent: 15.00,
        anti_sniping_seconds: 120,
        terms_and_conditions: 'All sales final. Payment due within 48 hours. Local pickup available or shipping can be arranged.',
        preview_start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        preview_end: startsAt.toISOString(),
        pickup_start: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        pickup_end: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating auction:', error.message);
      return null;
    }

    console.log(`✓ Auction created: "${data.title}" (ID: ${data.id})`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Started: ${new Date(data.starts_at).toLocaleString()}`);
    console.log(`  Ends: ${new Date(data.ends_at).toLocaleString()}`);
    return data;
  } catch (error) {
    console.error('Exception creating auction:', error.message);
    return null;
  }
}

async function createLots(auctionId) {
  try {
    console.log(`Creating ${AUCTION_LOTS.length} auction lots...`);

    const lotsToInsert = AUCTION_LOTS.map(lot => ({
      auction_id: auctionId,
      ...lot
    }));

    const { data, error } = await supabase
      .from('lots')
      .insert(lotsToInsert)
      .select();

    if (error) {
      console.error('Error creating lots:', error.message);
      return null;
    }

    console.log(`✓ Created ${data.length} lots:`);
    data.forEach(lot => {
      console.log(`  - Lot ${lot.lot_number}: ${lot.title} (Starting: $${(lot.starting_bid / 100).toFixed(2)})`);
    });
    return data;
  } catch (error) {
    console.error('Exception creating lots:', error.message);
    return null;
  }
}

async function addWalletCredits(userId, amount, description) {
  try {
    console.log(`Adding $${(amount / 100).toFixed(2)} ITC credits to user ${userId}...`);

    const { data, error } = await supabase
      .from('wallet_ledger')
      .insert({
        user_id: userId,
        transaction_type: 'purchase',
        amount: amount,
        balance_after: amount, // First transaction sets balance
        description: description,
        reference_type: 'test_seed',
        metadata: { source: 'seed_script', date: new Date().toISOString() }
      })
      .select()
      .single();

    if (error) {
      console.error(`Error adding wallet credits:`, error.message);
      return null;
    }

    console.log(`✓ Added credits. New balance: $${(data.balance_after / 100).toFixed(2)}`);
    return data;
  } catch (error) {
    console.error('Exception adding wallet credits:', error.message);
    return null;
  }
}

async function main() {
  console.log('\n🌱 Starting seed process for ImagineThisAuction...\n');
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  const createdUsers = {};

  // Step 1: Create all users
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Creating Users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const userData of TEST_USERS) {
    const authUser = await createAuthUser(userData);
    if (!authUser) continue;

    const publicUser = await createPublicUser(authUser, userData);
    if (!publicUser) continue;

    createdUsers[userData.email] = {
      auth: authUser,
      public: publicUser,
      role: userData.role
    };
    console.log('');
  }

  // Step 2: Create auctioneer profile
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Creating Auctioneer Profile');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const auctioneerUser = createdUsers['auctioneer@test.com'];
  if (!auctioneerUser) {
    console.error('❌ Auctioneer user not found. Cannot continue.');
    process.exit(1);
  }

  const auctioneerProfile = await createAuctioneerProfile(auctioneerUser.public.id);
  if (!auctioneerProfile) {
    console.error('❌ Failed to create auctioneer profile. Cannot continue.');
    process.exit(1);
  }
  console.log('');

  // Step 3: Create auction
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Creating Live Auction');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const auction = await createAuction(auctioneerProfile.id);
  if (!auction) {
    console.error('❌ Failed to create auction. Cannot continue.');
    process.exit(1);
  }
  console.log('');

  // Step 4: Create lots
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Creating Auction Lots');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const lots = await createLots(auction.id);
  if (!lots) {
    console.error('❌ Failed to create lots.');
  }
  console.log('');

  // Step 5: Add wallet credits to bidders
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Adding ITC Credits to Bidders');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bidderCredits = [
    { email: 'bidder1@test.com', amount: 50000 }, // $500
    { email: 'bidder2@test.com', amount: 75000 }, // $750
    { email: 'bidder3@test.com', amount: 100000 } // $1000
  ];

  for (const { email, amount } of bidderCredits) {
    const bidder = createdUsers[email];
    if (!bidder) {
      console.error(`❌ Bidder ${email} not found. Skipping credits.`);
      continue;
    }

    await addWalletCredits(
      bidder.public.id,
      amount,
      'Initial test credits for bidding'
    );
    console.log('');
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SEED COMPLETE - Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Created Users:');
  Object.entries(createdUsers).forEach(([email, user]) => {
    console.log(`  - ${email} (${user.role})`);
  });
  console.log('');

  console.log('Created Auctioneer:');
  console.log(`  - Test Auction House (ID: ${auctioneerProfile.id})`);
  console.log('');

  console.log('Created Auction:');
  console.log(`  - ${auction.title}`);
  console.log(`  - Status: ${auction.status}`);
  console.log(`  - Lots: ${lots?.length || 0}`);
  console.log('');

  console.log('Test Credentials:');
  console.log('  All passwords: TestPass123!');
  console.log('');

  console.log('🎉 You can now log in and start testing!\n');
}

main().catch(console.error);
