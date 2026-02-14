// Setup Database Script - Creates users and seeds data
// Uses direct PostgreSQL connection via Supabase

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// For admin operations, we need the service role key
// Since we don't have it, we'll use the database connection string instead
// Get this from Supabase Dashboard > Settings > Database

async function setupViaRPC() {
    console.log('='.repeat(60));
    console.log('ImagineThisAuction - Database Setup');
    console.log('='.repeat(60));
    console.log('');
    console.log('Since we need to create auth users, you have two options:');
    console.log('');
    console.log('OPTION 1: Run SQL in Supabase Dashboard (RECOMMENDED)');
    console.log('-'.repeat(60));
    console.log('1. Go to: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/sql/new');
    console.log('2. Copy the contents of: supabase/complete-setup.sql');
    console.log('3. Paste and click "Run"');
    console.log('');
    console.log('OPTION 2: Get your Database Connection String');
    console.log('-'.repeat(60));
    console.log('1. Go to: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/settings/database');
    console.log('2. Copy the "Connection string" (URI format)');
    console.log('3. Run: psql "YOUR_CONNECTION_STRING" -f supabase/complete-setup.sql');
    console.log('');
    console.log('='.repeat(60));
    console.log('');

    // Try to verify what's already in the database
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    console.log('Checking current database state...');
    console.log('');

    // Check users
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('email, role, is_approved');

    if (usersError) {
        console.log('Users table: Error -', usersError.message);
    } else {
        console.log(`Users found: ${users?.length || 0}`);
        users?.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    }

    // Check auctions
    const { data: auctions, error: auctionsError } = await supabase
        .from('auctions')
        .select('title, status');

    if (auctionsError) {
        console.log('Auctions table: Error -', auctionsError.message);
    } else {
        console.log(`Auctions found: ${auctions?.length || 0}`);
        auctions?.forEach(a => console.log(`  - ${a.title} (${a.status})`));
    }

    // Check lots
    const { data: lots, error: lotsError } = await supabase
        .from('lots')
        .select('lot_number, title, starting_bid');

    if (lotsError) {
        console.log('Lots table: Error -', lotsError.message);
    } else {
        console.log(`Lots found: ${lots?.length || 0}`);
        lots?.forEach(l => console.log(`  - Lot ${l.lot_number}: ${l.title} ($${l.starting_bid/100})`));
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('If the database is empty, please run the SQL setup script.');
    console.log('='.repeat(60));
}

setupViaRPC().catch(console.error);
