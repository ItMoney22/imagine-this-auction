# Task B - Schema & Migrations

## Purpose
Create comprehensive Supabase SQL migrations for all database tables, implement Row Level Security (RLS) policies, add performance indexes, and provide seed data for development and testing.

## Scope
- Complete database schema with all required tables
- SQL migrations for database structure
- Row Level Security (RLS) policies for data protection
- Performance indexes for critical queries
- Seed data script (1 auctioneer, 2 auctions, 20 lots)
- Database functions for complex operations

## Acceptance Criteria
- ✅ All tables created with proper relationships
- ✅ RLS policies ensure data security by role
- ✅ Indexes added for performance-critical queries
- ✅ Seed script provides realistic test data
- ✅ Database functions for bidding and wallet operations
- ✅ TypeScript types updated to match schema

## Database Schema

### Core Tables

#### Users & Authentication
- `users` - User profiles with roles and approval status
- `auctioneers` - Auctioneer company information and approval workflow

#### Auction System
- `auctions` - Auction events with timing and settings
- `lots` - Individual items within auctions
- `bids` - Bid history with amounts and timestamps

#### Financial System
- `wallet_ledger` - All ITC credit transactions and movements
- `invoices` - Winner invoices with buyer's premium
- `payment_events` - Provider-agnostic payment event tracking for idempotency
- `payouts_due` - Auctioneers' pending payouts

#### Administrative
- `audit_log` - System actions and changes tracking

### Key Relationships
- Users (1) → Auctioneers (1) - Optional auctioneer profile
- Auctioneers (1) → Auctions (many) - Auctioneer owns auctions
- Auctions (1) → Lots (many) - Lots belong to auctions
- Lots (1) → Bids (many) - Bids placed on lots
- Users (1) → Wallet Ledger (many) - User's credit transactions
- Users (1) → Bids (many) - User's bidding history

### Row Level Security Policies

#### Bidders
- **Read**: Own wallet ledger, own bids, public auctions/lots
- **Write**: Own bids (with validation), profile updates

#### Auctioneers
- **Read**: Own auctions/lots, related bids, own payouts
- **Write**: Own auctions/lots, shipping confirmations

#### Admins
- **Read**: All data
- **Write**: User approvals, platform settings, manual adjustments

### Performance Indexes
- `bids(lot_id, created_at DESC)` - Bid history by lot
- `wallet_ledger(user_id, created_at DESC)` - User transaction history
- `lots(auction_id, lot_number)` - Lots within auctions
- `auctions(starts_at, ends_at)` - Auction timing queries

## Technical Details

### Database Functions
1. **place_bid()** - Atomic bid placement with validation
2. **process_auction_end()** - Determine winners and create invoices
3. **credit_purchase()** - Add ITC credits to wallet
4. **escrow_operations()** - Handle escrow holds and releases

### Seed Data Structure
- **Admin User**: Full system access
- **Auctioneer**: "Heritage Auctions LLC" with 2 active auctions
- **Test Bidders**: 5 users with various ITC balances
- **Auctions**: "Fine Art Collection" (live) and "Vintage Watches" (scheduled)
- **Lots**: 20 diverse items with different starting bids and categories

## Files to Create
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`
- `supabase/migrations/003_indexes_functions.sql`
- `supabase/seed.sql`
- Updated `lib/types/database.ts`

## Status
**Current**: ✅ Completed
**Progress**: 100%

## Completed Tasks
1. ✅ Initial schema migration with all tables and constraints
2. ✅ Comprehensive RLS policies for role-based security
3. ✅ Performance indexes for critical queries
4. ✅ Database functions for bidding, wallet, and auction operations
5. ✅ Complete seed data with realistic test scenarios
6. ✅ Updated TypeScript types to match schema
7. ✅ Fixed Next.js 15 compatibility issues

## Files Created
- **Migrations**: `supabase/migrations/001_initial_schema.sql` (tables, constraints, triggers)
- **Security**: `supabase/migrations/002_rls_policies.sql` (row level security)
- **Performance**: `supabase/migrations/003_indexes_functions.sql` (indexes, functions)
- **Seed Data**: `supabase/seed.sql` (realistic test data)
- **Types**: Updated `lib/types/database.ts` (complete schema types)

## Database Features
### Tables (9 total)
- **Core**: users, auctioneers, auctions, lots, bids
- **Financial**: wallet_ledger, invoices, payment_events, payouts_due
- **Admin**: audit_log

### Security Features
- Role-based access control with RLS policies
- Bidders: own data only + public auctions
- Auctioneers: own auctions/lots + related data
- Admins: full system access

### Performance Optimizations
- **Bidding queries**: lots/bids indexes by creation time
- **Wallet queries**: user transaction history indexes
- **Search queries**: auction status and timing indexes

### Business Logic Functions
- **place_bid()**: Atomic bidding with wallet operations and anti-sniping
- **process_auction_end()**: Winner determination and invoice creation
- **add_wallet_credits()**: Stripe purchase processing
- **release_escrow_on_shipping()**: Escrow and payout processing

## Seed Data Includes
- 6 users (1 admin, 1 auctioneer, 5 bidders)
- 1 approved auctioneer company
- 2 auctions (1 live with bids, 1 scheduled)
- 20 lots (10 fine art, 10 vintage watches)
- Active bidding scenarios with wallet transactions
- ITC credit balances for all test bidders

**Next**: Task C - Auctions & Lots CRUD + CSV Upload
**Updated**: 2025-09-23
