# Test Data Seeding - ImagineThisAuction

## Summary

I've created a complete test data seeding system for your ImagineThisAuction application. The setup will create 5 test users, a live auction with 6 lots, and wallet credits for bidders.

## Files Created

### Scripts
1. **`create-auth-users.js`** - Creates auth users using Supabase Admin API
2. **`seed-test-data.js`** - Alternative full seed script (has RLS limitations)
3. **`supabase/seed.sql`** - SQL seed script for database data

### Documentation
4. **`QUICK_START.md`** - 5-minute manual setup guide
5. **`SEED_INSTRUCTIONS.md`** - Detailed instructions for automated approach
6. **`README_SEEDING.md`** - This file

## Recommended Approach: Manual (Fastest - 5 minutes)

### Step 1: Create Users in Supabase Dashboard

Go to: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/auth/users

Click "Add User" and create these 5 users:

```
Email: davidltrinidad@gmail.com
Password: TestPass123!
✓ Auto Confirm User

Email: auctioneer@test.com
Password: TestPass123!
✓ Auto Confirm User

Email: bidder1@test.com
Password: TestPass123!
✓ Auto Confirm User

Email: bidder2@test.com
Password: TestPass123!
✓ Auto Confirm User

Email: bidder3@test.com
Password: TestPass123!
✓ Auto Confirm User
```

### Step 2: Run SQL Seed Script

1. Go to: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx/sql/new
2. Copy the entire contents of: `supabase/seed.sql`
3. Paste into SQL Editor
4. Click **Run** (Ctrl+Enter)

### Step 3: Verify

Run this verification query:

```sql
SELECT email, role, is_approved FROM users
WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com'
ORDER BY role, email;
```

Expected: 5 users with proper roles

## Alternative: Automated Approach

If you have your Supabase **service_role** key:

```bash
cd "E:\Projects for MetaSphere\Imagine This Auction"
node create-auth-users.js
# Enter your service_role key when prompted
# Then run the SQL script in the dashboard
```

## What Gets Created

### Users (5)
| Email | Password | Role | Credits |
|-------|----------|------|---------|
| davidltrinidad@gmail.com | TestPass123! | admin | - |
| auctioneer@test.com | TestPass123! | auctioneer | - |
| bidder1@test.com | TestPass123! | bidder | $500 |
| bidder2@test.com | TestPass123! | bidder | $750 |
| bidder3@test.com | TestPass123! | bidder | $1,000 |

### Auctioneer Profile
- Company: Test Auction House
- Status: Approved
- Location: New York, NY

### Live Auction
- **Title**: Community Collectibles & Treasures Auction
- **Status**: Live (started 2 hours ago, ends in 6 hours)
- **Buyer Premium**: 15%
- **Anti-Snipe Window**: 120 seconds

### Auction Lots (6)

| Lot | Item | Starting Bid | Reserve | Category |
|-----|------|--------------|---------|----------|
| 1 | Vintage Canon AE-1 Camera | $150 | $200 | Photography |
| 2 | Classic Rock Vinyl Records | $200 | $300 | Music |
| 3 | Handcrafted Oak Rocking Chair | $120 | $180 | Furniture |
| 4 | Signed Baseball Memorabilia | $250 | $350 | Sports |
| 5 | Vintage Star Wars Figures | $300 | $400 | Toys |
| 6 | Handmade Ceramic Pottery Set | $80 | $120 | Art |

## Testing Scenarios

After seeding, you can test:

### As Admin (davidltrinidad@gmail.com)
- View all users
- Approve/reject auctioneers
- Monitor all auctions
- Access admin dashboard

### As Auctioneer (auctioneer@test.com)
- View your live auction
- Monitor bids in real-time
- Manage lot details
- View auctioneer dashboard

### As Bidder (bidder1@test.com, bidder2@test.com, bidder3@test.com)
- Browse live auction
- Place bids on lots
- View wallet balance
- Test real-time bid updates
- Test anti-snipe extension
- Test outbid notifications

## Architecture Notes

### Foreign Key Chain
The seed script respects the FK hierarchy:
```
auth.users
  ↓
public.users
  ↓
auctioneers
  ↓
auctions
  ↓
lots
```

### Wallet System
- Uses ledger-based accounting (wallet_ledger table)
- Each transaction records balance_after
- Bidders start with initial credits for testing
- Credits are in cents (ITC - ImagineThis Credits)

### RLS Policies
- Admin: Full access to all tables
- Auctioneer: Can manage own auctions/lots
- Bidder: Can view live auctions, place bids, view own wallet

## Troubleshooting

### "Email already exists"
Users were already created. This is fine - just continue to Step 2.

### "Row violates RLS policy"
You need to use the SQL Editor in Supabase Dashboard (uses postgres role) or provide service_role key.

### "Foreign key violation"
Auth users must exist first. Make sure Step 1 is complete before running SQL script.

### Auction showing as "draft" or "ended"
The timing is relative to when you run the script. Edit the dates in `seed.sql` if needed:
```sql
starts_at = NOW() - INTERVAL '2 hours',
ends_at = NOW() + INTERVAL '6 hours',
```

### Can't log in
- Verify users exist in: Authentication > Users
- Check "Auto Confirm User" was enabled
- Password is case-sensitive: `TestPass123!`

## Clean Up

To remove all test data:

```sql
DELETE FROM bids WHERE bidder_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.com'
);
DELETE FROM wallet_ledger WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com'
);
DELETE FROM lots WHERE auction_id IN (
    SELECT id FROM auctions WHERE title LIKE '%Community Collectibles%'
);
DELETE FROM auctions WHERE title LIKE '%Community Collectibles%';
DELETE FROM auctioneers WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.com'
);
DELETE FROM users WHERE email LIKE '%@test.com' OR email = 'davidltrinidad@gmail.com';
```

Then manually delete auth users from: Authentication > Users

## File Locations

```
E:\Projects for MetaSphere\Imagine This Auction\
├── create-auth-users.js          # Auth user creation script
├── seed-test-data.js              # Alternative Node.js seed (RLS issues)
├── supabase/
│   └── seed.sql                   # Main SQL seed script
├── QUICK_START.md                 # 5-minute manual guide
├── SEED_INSTRUCTIONS.md           # Detailed automation guide
└── README_SEEDING.md              # This file
```

## Next Steps

1. Follow **QUICK_START.md** for the fastest manual setup
2. Or see **SEED_INSTRUCTIONS.md** for automated approach
3. Test login with any of the created users
4. Start placing test bids!

## Support

Your Supabase project: https://yhfelrmpwkzvnruubklx.supabase.co
Dashboard: https://supabase.com/dashboard/project/yhfelrmpwkzvnruubklx

Common URLs:
- Auth Users: `/auth/users`
- SQL Editor: `/sql/new`
- API Settings: `/settings/api`
- Database Tables: `/editor`

---

**Password for all test users**: `TestPass123!`
