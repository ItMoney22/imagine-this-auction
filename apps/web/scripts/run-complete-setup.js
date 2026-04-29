// Complete Database Setup Script
// Creates auth users and seeds all test data

const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const TEST_USERS = [
    { id: 'a0000000-0000-0000-0000-000000000001', email: 'davidltrinidad@gmail.com', password: 'TestPass123!', firstName: 'David', lastName: 'Trinidad', role: 'admin' },
    { id: 'a0000000-0000-0000-0000-000000000002', email: 'auctioneer@test.com', password: 'TestPass123!', firstName: 'Test', lastName: 'Auctioneer', role: 'auctioneer' },
    { id: 'a0000000-0000-0000-0000-000000000003', email: 'bidder1@test.com', password: 'TestPass123!', firstName: 'Alice', lastName: 'Bidder', role: 'bidder' },
    { id: 'a0000000-0000-0000-0000-000000000004', email: 'bidder2@test.com', password: 'TestPass123!', firstName: 'Bob', lastName: 'Bidder', role: 'bidder' },
    { id: 'a0000000-0000-0000-0000-000000000005', email: 'bidder3@test.com', password: 'TestPass123!', firstName: 'Carol', lastName: 'Bidder', role: 'bidder' },
];

async function createAuthUsers() {
    console.log('\n📧 Creating Auth Users...');

    for (const user of TEST_USERS) {
        // First try to delete existing user
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === user.email);

        if (existing) {
            console.log(`  Deleting existing user: ${user.email}`);
            await supabase.auth.admin.deleteUser(existing.id);
        }

        // Create new user with specific ID
        const { data, error } = await supabase.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: {
                first_name: user.firstName,
                last_name: user.lastName
            }
        });

        if (error) {
            console.log(`  ❌ Error creating ${user.email}: ${error.message}`);
        } else {
            console.log(`  ✅ Created: ${user.email} (ID: ${data.user.id})`);
            // Update user.id with the actual created ID
            user.id = data.user.id;
        }
    }
}

async function createPublicUsers() {
    console.log('\n👥 Creating Public Users...');

    for (const user of TEST_USERS) {
        const { error } = await supabase
            .from('users')
            .upsert({
                id: user.id,
                email: user.email,
                role: user.role,
                first_name: user.firstName,
                last_name: user.lastName,
                is_approved: true
            }, { onConflict: 'id' });

        if (error) {
            console.log(`  ❌ Error: ${user.email} - ${error.message}`);
        } else {
            console.log(`  ✅ ${user.email} (${user.role})`);
        }
    }
}

async function createAuctioneer() {
    console.log('\n🏢 Creating Auctioneer Organization...');

    const auctioneerUser = TEST_USERS.find(u => u.role === 'auctioneer');

    const { data, error } = await supabase
        .from('auctioneers')
        .upsert({
            id: 'b0000000-0000-0000-0000-000000000001',
            user_id: auctioneerUser.id,
            company_name: 'Community Auction House',
            address_line1: '123 Main Street',
            city: 'Atlanta',
            state: 'GA',
            zip_code: '30301',
            website: 'https://communityauctions.test',
            is_approved: true,
            approval_date: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();

    if (error) {
        console.log(`  ❌ Error: ${error.message}`);
        return null;
    }
    console.log(`  ✅ Community Auction House created`);
    return data;
}

async function createAuction(auctioneerId) {
    console.log('\n🎪 Creating Live Auction...');

    const startsAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const { data, error } = await supabase
        .from('auctions')
        .upsert({
            id: 'c0000000-0000-0000-0000-000000000001',
            auctioneer_id: auctioneerId || 'b0000000-0000-0000-0000-000000000001',
            title: 'Community Estate Sale',
            description: 'A wonderful collection of household treasures, vintage finds, and collectibles from a local family. Something for everyone!',
            status: 'live',
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            buyer_premium_percent: 10.00,
            anti_sniping_seconds: 60
        }, { onConflict: 'id' })
        .select()
        .single();

    if (error) {
        console.log(`  ❌ Error: ${error.message}`);
        return null;
    }
    console.log(`  ✅ Community Estate Sale (LIVE until ${endsAt.toLocaleString()})`);
    return data;
}

async function createLots(auctionId) {
    console.log('\n📦 Creating Auction Lots...');

    // First delete existing lots
    await supabase.from('lots').delete().eq('auction_id', auctionId || 'c0000000-0000-0000-0000-000000000001');

    const lots = [
        { lot_number: 1, title: 'Canon AE-1 Program 35mm Film Camera', description: 'Classic 1980s SLR camera in excellent working condition. Includes original 50mm f/1.8 lens, leather case, and instruction manual. Perfect for photography enthusiasts!', starting_bid: 7500, increment: 500, estimate_low: 10000, estimate_high: 15000, category: 'Electronics', images: '["/lots/camera-vintage.webp"]' },
        { lot_number: 2, title: 'Classic Rock & Jazz Vinyl Collection (25 LPs)', description: 'Carefully curated collection of 25 vinyl records including Beatles, Led Zeppelin, Miles Davis, and more. All in VG+ to NM condition.', starting_bid: 12000, increment: 1000, estimate_low: 20000, estimate_high: 30000, category: 'Music', images: '["/lots/vinyl-records.webp"]' },
        { lot_number: 3, title: 'Handcrafted Oak Rocking Chair, c.1920', description: 'Beautiful antique rocking chair with original finish. Solid oak construction with elegant curved arms. A true heirloom piece!', starting_bid: 15000, increment: 1000, estimate_low: 25000, estimate_high: 40000, category: 'Furniture', images: '["/lots/rocking-chair.webp"]' },
        { lot_number: 4, title: 'Vintage Baseball Memorabilia Lot', description: 'Collection includes 1950s Topps baseball cards, vintage leather glove, and signed baseball. Great for sports fans!', starting_bid: 5000, increment: 500, estimate_low: 8000, estimate_high: 15000, category: 'Sports', images: '["/lots/sports-memorabilia.webp"]' },
        { lot_number: 5, title: '1960s Tin Toy Robot & Vintage Games', description: 'Nostalgic collection of classic toys including battery-operated tin robot and vintage board games. Bring back childhood memories!', starting_bid: 8000, increment: 500, estimate_low: 12000, estimate_high: 20000, category: 'Toys', images: '["/lots/vintage-toys.webp"]' },
        { lot_number: 6, title: 'Artisan Ceramic Bowl & Vase Collection', description: 'Set of 5 hand-thrown pottery pieces by local artist. Beautiful earth-toned glazes, each piece unique. Perfect for home decor!', starting_bid: 6000, increment: 500, estimate_low: 10000, estimate_high: 18000, category: 'Art', images: '["/lots/pottery-handmade.webp"]' },
    ];

    for (const lot of lots) {
        const { error } = await supabase
            .from('lots')
            .insert({
                auction_id: auctionId || 'c0000000-0000-0000-0000-000000000001',
                ...lot
            });

        if (error) {
            console.log(`  ❌ Lot ${lot.lot_number}: ${error.message}`);
        } else {
            console.log(`  ✅ Lot ${lot.lot_number}: ${lot.title} ($${lot.starting_bid / 100})`);
        }
    }
}

async function addWalletCredits() {
    console.log('\n💰 Adding Wallet Credits...');

    const bidders = TEST_USERS.filter(u => u.role === 'bidder');
    const amounts = [50000, 75000, 100000]; // $500, $750, $1000

    for (let i = 0; i < bidders.length; i++) {
        const bidder = bidders[i];
        const amount = amounts[i];

        // Delete existing wallet entries
        await supabase.from('wallet_ledger').delete().eq('user_id', bidder.id);

        const { error } = await supabase
            .from('wallet_ledger')
            .insert({
                user_id: bidder.id,
                transaction_type: 'purchase',
                amount: amount,
                balance_after: amount,
                description: `Welcome bonus - $${amount / 100} ITC credits`
            });

        if (error) {
            console.log(`  ❌ ${bidder.email}: ${error.message}`);
        } else {
            console.log(`  ✅ ${bidder.email}: $${amount / 100} credits`);
        }
    }
}

async function verifySeed() {
    console.log('\n📊 Verification...');

    const { data: users } = await supabase.from('users').select('email, role');
    console.log(`  Users: ${users?.length || 0}`);

    const { data: auctions } = await supabase.from('auctions').select('title, status');
    console.log(`  Auctions: ${auctions?.length || 0}`);

    const { data: lots } = await supabase.from('lots').select('lot_number, title');
    console.log(`  Lots: ${lots?.length || 0}`);

    const { data: wallet } = await supabase.from('wallet_ledger').select('user_id, amount');
    console.log(`  Wallet entries: ${wallet?.length || 0}`);
}

async function main() {
    console.log('='.repeat(60));
    console.log('🚀 ImagineThisAuction - Complete Database Setup');
    console.log('='.repeat(60));

    try {
        await createAuthUsers();
        await createPublicUsers();
        const auctioneer = await createAuctioneer();
        const auction = await createAuction(auctioneer?.id);
        await createLots(auction?.id);
        await addWalletCredits();
        await verifySeed();

        console.log('\n' + '='.repeat(60));
        console.log('✅ Setup Complete!');
        console.log('='.repeat(60));
        console.log('\nLogin credentials:');
        console.log('  Admin:      davidltrinidad@gmail.com / TestPass123!');
        console.log('  Auctioneer: auctioneer@test.com / TestPass123!');
        console.log('  Bidder 1:   bidder1@test.com / TestPass123! ($500)');
        console.log('  Bidder 2:   bidder2@test.com / TestPass123! ($750)');
        console.log('  Bidder 3:   bidder3@test.com / TestPass123! ($1000)');
        console.log('\nApp URL: http://localhost:3003');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
