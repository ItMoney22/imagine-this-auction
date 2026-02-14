# Quick Start: Create Test Users (5 minutes)

## Fastest Method: Manual Setup in Supabase Dashboard

### Step 1: Create Auth Users (2 minutes)

Go to: **Authentication > Users > Add User**
https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/auth/users

Create these 5 users (one at a time):

| Email | Password | Auto Confirm |
|-------|----------|--------------|
| davidltrinidad@gmail.com | TestPass123! | ✓ Yes |
| auctioneer@test.com | TestPass123! | ✓ Yes |
| bidder1@test.com | TestPass123! | ✓ Yes |
| bidder2@test.com | TestPass123! | ✓ Yes |
| bidder3@test.com | TestPass123! | ✓ Yes |

**Important**: Check "Auto Confirm User" for each user.

### Step 2: Run SQL Seed Script (2 minutes)

1. Go to: **SQL Editor > New Query**
   https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/sql/new

2. Copy and paste the entire contents of: `supabase/seed.sql`

3. Click **Run** (or press Ctrl+Enter)

4. Wait for completion and check the output notices

### Step 3: Verify (1 minute)

Run this query to verify everything was created:

```sql
-- Check users and roles
SELECT email, role, is_approved FROM users
WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com';

-- Check auction exists
SELECT title, status, starts_at, ends_at FROM auctions
WHERE title LIKE '%Community Collectibles%';

-- Check lots
SELECT COUNT(*) as lot_count FROM lots
WHERE auction_id IN (SELECT id FROM auctions WHERE title LIKE '%Community Collectibles%');

-- Check wallet balances
SELECT u.email, SUM(w.amount)/100.0 as balance_dollars
FROM wallet_ledger w
JOIN users u ON w.user_id = u.id
GROUP BY u.email
ORDER BY u.email;
```

Expected results:
- 5 users (1 admin, 1 auctioneer, 3 bidders)
- 1 live auction
- 6 lots
- 3 wallet balances ($500, $750, $1000)

### Step 4: Test Login

Go to your app at: http://localhost:3000

Try logging in with:
- **Admin**: davidltrinidad@gmail.com / TestPass123!
- **Auctioneer**: auctioneer@test.com / TestPass123!
- **Bidder**: bidder1@test.com / TestPass123!

## Alternative: Automated Script Method

If you prefer automation and have your Supabase service_role key:

```bash
cd "E:\Projects for MetaSphere\Imagine This Auction"
node create-auth-users.js
# Then run the SQL seed script in dashboard
```

## What You Get

✅ **5 Test Users**
- 1 Admin (davidltrinidad@gmail.com)
- 1 Auctioneer (auctioneer@test.com)
- 3 Bidders (bidder1@test.com, bidder2@test.com, bidder3@test.com)

✅ **1 Live Auction**
- "Community Collectibles & Treasures Auction"
- Currently running (started 2 hours ago, ends in 6 hours)

✅ **6 Auction Lots**
1. Vintage Camera ($150)
2. Vinyl Records ($200)
3. Oak Rocking Chair ($120)
4. Baseball Memorabilia ($250)
5. Star Wars Figures ($300)
6. Pottery Set ($80)

✅ **Bidder Credits**
- Bidder 1: $500 ITC
- Bidder 2: $750 ITC
- Bidder 3: $1,000 ITC

## Troubleshooting

**"User already exists"**: Users were already created. Skip Step 1 and go directly to Step 2.

**SQL errors about auth users**: Make sure you completed Step 1 first. The seed script needs auth users to exist.

**RLS policy errors**: You're not logged in with enough privileges. Run the SQL in the Supabase Dashboard SQL Editor (it uses postgres role by default).

**Auction not "live"**: The timing is relative. Check the `starts_at` and `ends_at` in the seed.sql file and adjust if needed.

## Need Help?

See detailed instructions in: `SEED_INSTRUCTIONS.md`
