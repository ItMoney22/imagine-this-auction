# ImagineThisAuction - Master Build Plan

## Project Overview
**Goal**: Ship a mobile-first multi-auctioneer marketplace MVP with timed auctions, ITC credits via PaymentCloud (or alternative provider), and real-time bidding.

**Value Proposition**: Undercut HiBid pricing while delivering modern UX, credits wallet system, and real-time bidding experience.

## Tech Stack
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend/Database**: Supabase (Postgres, Auth, Storage, Realtime)
- **Payments**: PaymentCloud card processing + provider webhooks
- **Email**: Resend or Supabase SMTP
- **Hosting**: Vercel + Supabase

## Core Features (MVP)
1. **Authentication & Roles**: Bidder, Auctioneer, Admin with onboarding
2. **Timed Auctions**: Create/schedule with anti-sniping (+60s extension)
3. **Real-time Bidding**: Live updates, proxy bidding, outbid notifications
4. **ITC Credits System**: Provider-agnostic payments → wallet ledger with escrow mechanics
5. **Winner Flow**: Escrow hold → release on shipping confirmation
6. **Dashboards**: Role-specific interfaces (bidder/auctioneer/admin)

## Task Execution Plan

### Phase 1: Foundation (Tasks A-B)
- **Task A**: Project scaffolding, auth, basic navigation
- **Task B**: Database schema, migrations, RLS policies, seed data

### Phase 2: Core Marketplace (Tasks C-D)
- **Task C**: Auction/lot CRUD, CSV upload, marketplace views
- **Task D**: Real-time bidding engine with anti-sniping

### Phase 3: Payments & Escrow (Tasks E-F)
- **Task PAY**: Payment provider integration for credit packs
- **Task F**: Winner determination, invoicing, escrow system

### Phase 4: Administration & Testing (Tasks G-H)
- **Task G**: Admin dashboard for approvals and settings
- **Task H**: Comprehensive testing and documentation

## Success Criteria
- ✅ Complete user flows: signup → buy credits → bid → win → pay → ship
- ✅ Real-time bidding with anti-sniping protection
- ✅ Secure payment processing with escrow mechanics
- ✅ Mobile-first responsive design
- ✅ Production-ready deployment instructions

## Risk Mitigation
- **Payment Security**: Provider webhook validation + idempotency
- **Bidding Integrity**: Database transactions + optimistic locking
- **Performance**: Indexed queries + connection pooling
- **Compliance**: Georgia auctioneer licensing documentation

## Phase 2 Preparation (Future)
- Multi-tenant storefronts (/a/[auctioneerSlug])
- AI assistants (BidBuddy/ListMate)
- Revenue sharing (60/40 platform/auctioneer split)

---

**Status**: ✅ Plan Created | **Next**: Task A - Bootstrap & Auth
**Updated**: 2025-09-23
