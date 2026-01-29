# ImagineThisAuction

A modern, real-time auction platform built with Next.js 15, React 19, Supabase, and TypeScript. Features live bidding, anti-sniping protection, AI-powered auction assistants, and a comprehensive demo mode.

## Features

### Core Auction Functionality
- **Real-time Bidding** - Live bid updates via Supabase Realtime
- **Anti-Sniping Protection** - Soft close system that extends auctions when last-minute bids are placed
- **Multi-Lot Auctions** - Support for auctions with multiple items
- **Wallet System** - ITC (Internal Token Currency) wallet with holds and escrow
- **Invoice & Escrow Management** - Complete payment flow handling

### User Roles
- **Bidders** - Browse auctions, place bids, manage wallet
- **Auctioneers** - Create auctions, manage lots, upload inventory via CSV
- **Administrators** - Full platform management, user approval, system monitoring

### Demo Mode
- **Automated Bidding Bots** - Four realistic strategies (Early, Mid, Sniper, Chaser)
- **Live Demonstrations** - Showcase platform capabilities without real users
- **Admin Dashboard** - Real-time metrics, logs, and system controls

### Technology Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **UI Components**: Radix UI, Lucide Icons
- **Forms**: React Hook Form + Zod validation
- **Testing**: Playwright

## Project Structure

```
imagine-this-auction/
├── apps/
│   └── web/                    # Main Next.js application
│       ├── app/                # App Router pages
│       │   ├── (auth)/        # Authentication pages
│       │   ├── admin/         # Admin dashboard
│       │   ├── auctioneer/    # Auctioneer interface
│       │   ├── dashboard/     # User dashboards
│       │   └── api/           # API routes
│       ├── components/        # React components
│       ├── config/            # Configuration files
│       ├── lib/               # Utility libraries
│       ├── scripts/           # CLI scripts
│       └── workers/           # Background workers
├── packages/                   # Shared packages
├── supabase/
│   ├── functions/             # Edge Functions
│   └── migrations/            # Database migrations
└── docs/                       # Documentation
    ├── ADMIN_PANEL.md
    ├── CSV_LOTS.md
    ├── DB_SCHEMA.md
    ├── INVOICES_ESCROW.md
    ├── PAYMENTCLOUD.md
    ├── SETUP.md
    ├── STRIPE.md
    └── VPS_DEPLOYMENT.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm
- Supabase account
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ItMoney22/imagine-this-auction.git
   cd imagine-this-auction
   ```

2. **Install dependencies**
   ```bash
   cd apps/web
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Set up database**
   ```bash
   supabase db push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   Visit http://localhost:3000

## Demo Mode

Run the full demo experience with automated bidding bots:

```bash
cd apps/web

# Reset and seed demo data
pnpm tsx scripts/demo-run.ts --reset --yes

# Start the demo
pnpm tsx scripts/demo-run.ts --start
```

Or use the admin interface at `/admin/demo`.

See [DEMO_MODE_GUIDE.md](DEMO_MODE_GUIDE.md) for detailed instructions.

## Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint

# Demo Mode
pnpm tsx scripts/demo-run.ts --start    # Start demo
pnpm tsx scripts/demo-run.ts --stop     # Stop demo
pnpm tsx scripts/demo-run.ts --status   # Check status
pnpm tsx scripts/demo-run.ts --reset    # Reset demo data
```

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](docs/SETUP.md) | Complete setup guide |
| [DB_SCHEMA.md](docs/DB_SCHEMA.md) | Database schema reference |
| [ADMIN_PANEL.md](docs/ADMIN_PANEL.md) | Admin panel documentation |
| [CSV_LOTS.md](docs/CSV_LOTS.md) | CSV import for auction lots |
| [INVOICES_ESCROW.md](docs/INVOICES_ESCROW.md) | Payment flow documentation |
| [VPS_DEPLOYMENT.md](docs/VPS_DEPLOYMENT.md) | VPS deployment guide |
| [DEMO_MODE_GUIDE.md](DEMO_MODE_GUIDE.md) | Demo mode instructions |

## Anti-Sniping System

The platform includes a soft close anti-sniping system:

- **Soft Close Window**: Last 30 seconds of auction
- **Extension**: 60 seconds added when bid placed in soft close
- **Multiple Extensions**: Can trigger multiple times
- **Real-time Notifications**: All participants notified instantly

## Configuration

### Auction Timing
```typescript
LOT_DURATION_SEC: 420,        // 7 minutes per lot
SOFT_CLOSE_WINDOW_SEC: 30,    // Anti-snipe window
SOFT_CLOSE_EXTEND_SEC: 60,    // Extension time
```

### Bot Configuration (Demo Mode)
```typescript
NUM_BOT_BIDDERS: 14,              // Number of bots
BOT_MAX_BID_ITC: 1500,            // Max bot bid
BOT_THROTTLE_MS: [4000, 12000],   // Delay range
```

## API Endpoints

### Demo Control
```bash
POST /api/demo/control  # Start/stop/reset demo
GET  /api/demo/control  # Get demo status
GET  /api/demo/logs     # Get system logs
```

### Health Check
```bash
GET /api/health         # Application health status
```

## Deployment

### PM2 (Recommended for VPS)
```bash
npm run build
pm2 start npm --name "imagine-auction" -- start
pm2 save
```

### Environment Variables
```env
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

See [VPS_DEPLOYMENT.md](docs/VPS_DEPLOYMENT.md) for detailed deployment instructions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For setup issues, check the [troubleshooting section](docs/SETUP.md#troubleshooting) in the setup guide.
