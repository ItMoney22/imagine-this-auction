# Test Data Seeding Instructions

This guide will help you create test users and data for the ImagineThisAuction application.

## Overview

The seeding process has two main steps:
1. **Create Auth Users** - Create users in Supabase Authentication
2. **Seed Database** - Add user profiles, auctioneer data, auction, lots, and wallet credits

## Prerequisites

- Node.js installed
- Supabase project running (remote at https://yhfelrmpwkzvnruubklx.supabase.co)
- Supabase **service_role** key (Admin API access)

## Step 1: Get Your Service Role Key

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/settings/api
2. Under "Project API keys", find the **service_role** key (starts with `eyJ...`)
3. Copy this key (you'll need it in the next step)

⚠️ **Warning**: The service_role key has full admin access. Never commit it to git or expose it publicly.

## Step 2: Create Auth Users

Run the auth user creation script:

```bash
cd "E:\Projects for MetaSphere\Imagine This Auction"
node create-auth-users.js
```

When prompted, paste your service_role key. The script will create 5 auth users:

- **davidltrinidad@gmail.com** (Admin)
- **auctioneer@test.com** (Auctioneer)
- **bidder1@test.com** (Bidder)
- **bidder2@test.com** (Bidder)
- **bidder3@test.com** (Bidder)

All users will have the password: `TestPass123!`

## Step 3: Seed Database with SQL

After auth users are created, run the SQL seed script:

### Option A: Using Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/sql/new
2. Copy the entire contents of `supabase/seed.sql`
3. Paste into the SQL Editor
4. Click "Run" or press Ctrl+Enter
5. Check the output/notices to verify success

### Option B: Using Supabase CLI (if local instance)

```bash
cd "E:\Projects for MetaSphere\Imagine This Auction"
supabase db reset --db-url "your-connection-string"
```

## What Gets Created

### Users (5 total)

| Email | Role | Password | Credits |
|-------|------|----------|---------|
| davidltrinidad@gmail.com | admin | TestPass123! | - |
| auctioneer@test.com | auctioneer | TestPass123! | - |
| bidder1@test.com | bidder | TestPass123! | $500 |
| bidder2@test.com | bidder | TestPass123! | $750 |
| bidder3@test.com | bidder | TestPass123! | $1,000 |

### Auctioneer Profile

- **Company**: Test Auction House
- **Status**: Approved
- **Location**: New York, NY

### Live Auction

- **Title**: Community Collectibles & Treasures Auction
- **Status**: Live
- **Start Time**: 2 hours ago
- **End Time**: 6 hours from now
- **Lots**: 6 items

### Auction Lots (6 total)

1. **Vintage Canon AE-1 Camera** - Starting bid: $150
2. **Classic Rock Vinyl Records** - Starting bid: $200
3. **Handcrafted Oak Rocking Chair** - Starting bid: $120
4. **Signed Baseball Memorabilia** - Starting bid: $250
5. **Vintage Star Wars Action Figures** - Starting bid: $300
6. **Handmade Ceramic Pottery Set** - Starting bid: $80

## Verification

After seeding, verify the data was created:

### Check Users
```sql
SELECT email, role, first_name, last_name, is_approved
FROM users
WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com'
ORDER BY role, email;
```

### Check Auction and Lots
```sql
SELECT
    a.title,
    a.status,
    a.starts_at,
    a.ends_at,
    COUNT(l.id) as lot_count
FROM auctions a
LEFT JOIN lots l ON l.auction_id = a.id
WHERE a.title LIKE '%Community Collectibles%'
GROUP BY a.id;
```

### Check Wallet Balances
```sql
SELECT
    u.email,
    SUM(w.amount) / 100.0 as balance_dollars
FROM wallet_ledger w
JOIN users u ON w.user_id = u.id
GROUP BY u.id, u.email
ORDER BY u.email;
```

## Testing the Application

After seeding, you can:

1. **Login as Admin**: davidltrinidad@gmail.com / TestPass123!
   - View all users, auctions, and manage the platform

2. **Login as Auctioneer**: auctioneer@test.com / TestPass123!
   - View your auction
   - Monitor bids in real-time
   - Manage lots

3. **Login as Bidder**: bidder1@test.com / TestPass123!
   - Browse the live auction
   - Place bids on lots
   - View your wallet balance

## Troubleshooting

### "User already exists" error
- This is normal if you've run the script before
- The script will find and use the existing user ID

### "Permission denied" or RLS errors
- Make sure you're using the service_role key, not the anon key
- The SQL script must be run with service_role or postgres role

### "Foreign key violation" errors
- Ensure auth users were created first (Step 2)
- Check that auth user IDs exist before running seed.sql

### Auction not showing as "live"
- The auction timing is relative to when you run the script
- It starts 2 hours before current time and ends 6 hours after
- If needed, update the timestamps in seed.sql

## Clean Up Test Data

To remove all test data:

```sql
-- Delete in correct order (respecting foreign keys)
DELETE FROM bids WHERE bidder_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM wallet_ledger WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com');
DELETE FROM lots WHERE auction_id IN (SELECT id FROM auctions WHERE title LIKE '%Community Collectibles%');
DELETE FROM auctions WHERE title LIKE '%Community Collectibles%';
DELETE FROM auctioneers WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
DELETE FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com';

-- Delete auth users (do this in Dashboard or with admin API)
-- Go to: Authentication > Users > Select user > Delete
```

## Files Reference

- `create-auth-users.js` - Creates auth users with Admin API
- `supabase/seed.sql` - Main SQL seed script for all data
- `seed-test-data.js` - Alternative Node.js approach (has RLS issues)
- `SEED_INSTRUCTIONS.md` - This file

## Support

If you encounter issues:
1. Check Supabase Dashboard > Authentication > Users to verify auth users exist
2. Check Supabase Dashboard > SQL Editor to run verification queries
3. Review error messages for foreign key or constraint violations
4. Ensure your database migrations have all run successfully
