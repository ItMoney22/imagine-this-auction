/**
 * Create Auth Users in Supabase
 *
 * This script creates auth users using the Supabase Admin API
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set
 *
 * Run with: node create-auth-users.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'apps', 'web', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}

// If service role key not in env, prompt for it
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptForServiceKey() {
  return new Promise((resolve) => {
    if (serviceRoleKey) {
      resolve(serviceRoleKey);
      return;
    }

    console.log('\n⚠️  SUPABASE_SERVICE_ROLE_KEY not found in environment.');
    console.log('You can find it at: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/settings/api');
    console.log('Look for "service_role" key under "Project API keys"\n');

    rl.question('Enter your Supabase service_role key: ', (answer) => {
      serviceRoleKey = answer.trim();
      rl.close();
      resolve(serviceRoleKey);
    });
  });
}

const TEST_USERS = [
  {
    email: 'davidltrinidad@gmail.com',
    password: 'TestPass123!',
    user_metadata: {
      first_name: 'David',
      last_name: 'Trinidad'
    }
  },
  {
    email: 'auctioneer@test.com',
    password: 'TestPass123!',
    user_metadata: {
      first_name: 'Alice',
      last_name: 'Auctioneer'
    }
  },
  {
    email: 'bidder1@test.com',
    password: 'TestPass123!',
    user_metadata: {
      first_name: 'Bob',
      last_name: 'Bidder'
    }
  },
  {
    email: 'bidder2@test.com',
    password: 'TestPass123!',
    user_metadata: {
      first_name: 'Carol',
      last_name: 'Collector'
    }
  },
  {
    email: 'bidder3@test.com',
    password: 'TestPass123!',
    user_metadata: {
      first_name: 'Dan',
      last_name: 'Dealer'
    }
  }
];

async function createAuthUsers(adminClient) {
  console.log('\n🔐 Creating auth users...\n');
  const createdUsers = [];

  for (const userData of TEST_USERS) {
    try {
      console.log(`Creating: ${userData.email}...`);

      // Use admin API to create user
      const { data, error } = await adminClient.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true, // Auto-confirm email
        user_metadata: userData.user_metadata
      });

      if (error) {
        // Check if user already exists
        if (error.message.includes('already registered')) {
          console.log(`  ⚠️  User already exists: ${userData.email}`);

          // Try to get the existing user
          const { data: users } = await adminClient.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === userData.email);
          if (existingUser) {
            console.log(`  ✓ Found existing user (ID: ${existingUser.id})`);
            createdUsers.push({
              email: userData.email,
              id: existingUser.id,
              existed: true
            });
          }
        } else {
          console.error(`  ❌ Error: ${error.message}`);
        }
        continue;
      }

      console.log(`  ✓ Created (ID: ${data.user.id})`);
      createdUsers.push({
        email: userData.email,
        id: data.user.id,
        existed: false
      });

    } catch (error) {
      console.error(`  ❌ Exception: ${error.message}`);
    }
  }

  return createdUsers;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  ImagineThisAuction - Create Auth Users');
  console.log('═══════════════════════════════════════════════════');

  const key = await promptForServiceKey();

  if (!key || key.length < 20) {
    console.error('\n❌ Invalid service role key provided.');
    process.exit(1);
  }

  // Create admin client with service role key
  const adminClient = createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const createdUsers = await createAuthUsers(adminClient);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ COMPLETE - Summary');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('Auth Users:');
  createdUsers.forEach(user => {
    const status = user.existed ? '(existing)' : '(new)';
    console.log(`  ✓ ${user.email} ${status}`);
    console.log(`    ID: ${user.id}`);
  });

  console.log('\n📝 Next Steps:');
  console.log('1. Run the SQL seed script in Supabase SQL Editor:');
  console.log('   E:\\Projects for MetaSphere\\Imagine This Auction\\supabase\\seed.sql');
  console.log('');
  console.log('2. Or use the Supabase dashboard to manually:');
  console.log('   - Set user roles in public.users table');
  console.log('   - Create auctioneer profile');
  console.log('   - Create auction and lots');
  console.log('   - Add wallet credits');
  console.log('');
  console.log('🔑 Test Credentials:');
  console.log('   Password for all users: TestPass123!');
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
