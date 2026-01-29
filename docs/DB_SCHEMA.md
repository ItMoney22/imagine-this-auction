# ImagineThisAuction Database Schema

Complete Supabase database schema for the auction platform.

## Database Inventory

### Core Tables

• **users** - User profiles extending Supabase auth with roles (bidder/auctioneer/admin), approval status, contact info. Key columns: id(PK), email, role, is_approved. Relations: 1→many auctioneers, bids, wallet_ledger. Indexes: role, email.

• **auctioneers** - Auctioneer company profiles with business info, licensing, addresses. Key columns: id(PK), user_id(FK), company_name, is_approved. Relations: belongs to users, 1→many auctions. Indexes: user_id(approved), approval status.

• **auctions** - Auction events with timing, settings, buyer's premium. Key columns: id(PK), auctioneer_id(FK), status, starts_at, ends_at, buyer_premium_percent. Relations: belongs to auctioneers, 1→many lots. Indexes: status+timing, auctioneer_id.

• **lots** - Individual auction items with bidding details, estimates, images. Key columns: id(PK), auction_id(FK), lot_number, starting_bid, current_high_bid, winner_id. Relations: belongs to auctions, 1→many bids. Indexes: auction+lot_number, winning status.

• **bids** - Bidding history with regular/proxy types, amounts, winning status. Key columns: id(PK), lot_id(FK), bidder_id(FK), amount, is_winning. Relations: belongs to lots+users. Indexes: lot+created_desc, bidder+created_desc, winning bids.

### Financial Tables

• **wallet_ledger** - ITC credit transactions log with running balances. Key columns: id(PK), user_id(FK), transaction_type, amount, balance_after. Relations: belongs to users, references bids/invoices. Indexes: user+created_desc, reference lookup.

• **invoices** - Winner invoices with buyer's premium, shipping status. Key columns: id(PK), lot_id(FK), buyer_id(FK), hammer_price, total_amount, shipping status. Relations: belongs to lots+users. Indexes: buyer_id, lot_id.

• **payouts_due** - Auctioneer payouts after platform commission deduction. Key columns: id(PK), auctioneer_id(FK), invoice_id(FK), amount, platform_commission. Relations: belongs to auctioneers+invoices. Indexes: auctioneer(unpaid).

• **payment_events** - Provider-agnostic payment event log with provider metadata and payload archiving.

### Administrative Tables

• **audit_log** - System action tracking with before/after values. Key columns: id(PK), user_id, action, table_name, old/new_values. Relations: belongs to users. Indexes: user+created_desc, table+action.

## Row Level Security

- **bidders**: read/write only their own wallet, bids, invoices + public auction data
- **auctioneers**: read/write their own auctions, lots, shipping updates + related bids
- **admin**: full access to all tables and administrative functions

## Helper Functions

- **atomic_place_bid(lot_id, bid_amount_itc)** - Atomic bid placement with wallet deduction, outbid refunds, anti-sniping
- **process_auction_end(auction_id)** - Determine winners, create invoices, move funds to escrow
- **release_escrow_on_shipping(invoice_id)** - Release escrow, create auctioneer payouts
- **get_wallet_balance(user_id)** - Get current ITC balance
- **add_wallet_credits(user_id, amount, provider_event_id, description)** - Add ITC from provider webhook (PaymentCloud/crypto)

## Running the Migration

### In Supabase SQL Editor

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Create a new query
4. Copy the contents of `/supabase/migrations/0001_full_schema.sql`
5. Run the query to create all tables, indexes, policies, and functions

### Using Supabase CLI

```bash
# Make sure you're in the project root
cd /root/imagine-this-auction

# Apply the migration
supabase db push

# Or reset and apply (WARNING: destroys existing data)
supabase db reset
```

### Manual Steps After Migration

1. Create your first admin user in Supabase Auth
2. Uncomment and run the seed admin creation at the bottom of the migration:
   ```sql
   SELECT create_admin_user('admin@imaginethisauction.com');
   ```

## File Structure

```
/supabase/
├── migrations/
│   └── 0001_full_schema.sql    # Complete schema migration
└── seed.sql                    # Optional seed data (if needed)
```

## Key Features

- **Complete RLS policies** for role-based security
- **Performance indexes** for critical queries (bids, wallet, auctions)
- **Atomic functions** for complex operations (bidding, auction end, escrow)
- **Anti-sniping protection** built into bid placement
- **Wallet system** with transaction history and balance tracking
- **Audit logging** for administrative actions
- **Stripe integration** support with idempotency tracking

The schema supports a complete auction platform with secure multi-tenancy, financial tracking, and comprehensive business logic enforcement at the database level.
