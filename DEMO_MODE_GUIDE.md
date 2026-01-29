# Demo Mode System - Complete Implementation Guide

## 🎯 Overview

The Demo Mode system provides a complete live auction experience with real-time bidding, bot competition, and anti-sniping features. Perfect for demonstrations, testing, and showcasing the auction platform.

## 🔧 Quick Setup

### 1. Environment Configuration
```bash
# Add to .env.local
NODE_ENV=development
DEMO_MODE=true

# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Optional: AI Copywriter
COPYWRITER_PROVIDER=groq
GROQ_API_KEY=your-groq-key
```

### 2. Install Dependencies
```bash
# Core packages
npm install commander inquirer chalk tsx

# Worker process manager (optional)
npm install -g pm2
```

### 3. Database Setup
```bash
# Apply the demo schema (if not already done)
supabase db push
```

## 🚀 Quick Start

### Option 1: Full Reset & Start
```bash
cd apps/web

# Reset data and start fresh
pnpm tsx scripts/demo-run.ts --reset --yes

# Start the demo
pnpm tsx scripts/demo-run.ts --start
```

### Option 2: Admin Interface
1. Visit `/admin/demo` in your browser
2. Click "Reset & Reseed" to prepare data
3. Click "Start Demo" to begin live auctions

## 📋 System Components

### A) Core Configuration (`/config/demo.ts`)
- ✅ Master safety controls and feature flags
- ✅ Auction timing and anti-sniping settings
- ✅ Bot configuration and strategies
- ✅ Data templates and placeholder content

### B) Reset & Seeding System (`/scripts/demo-run.ts`)
- ✅ CLI controller with safety prompts
- ✅ Complete data seeding (auctioneers, auctions, lots, bots)
- ✅ Automatic wallet funding and user creation
- ✅ AI-generated hype copy for each lot

### C) Auction Timer Worker (`/workers/auction-timer.ts`)
- ✅ Real-time lot progression and timing
- ✅ Anti-sniping (soft close) protection
- ✅ Automatic lot transitions
- ✅ Realtime channel broadcasts
- ✅ Health checks and error recovery

### D) Bidding Bot System (`/workers/bidding-bots.ts`)
- ✅ Four realistic strategies: Early, Mid, Sniper, Chaser
- ✅ Intelligent bid calculation and timing
- ✅ Throttling and spending limits
- ✅ Real-time event responses

### E) Real-time UI Components
- ✅ Live auction timers (`/components/demo/auction-timer.tsx`)
- ✅ Admin dashboard (`/app/admin/demo/page.tsx`)
- ✅ Real-time bid updates and anti-snipe notifications

### F) API Endpoints
- ✅ Demo control API (`/api/demo/control/route.ts`)
- ✅ Logging and diagnostics API (`/api/demo/logs/route.ts`)

### G) Comprehensive Testing
- ✅ Unit tests for all components
- ✅ Integration tests for auction flows
- ✅ Performance and scalability validation

### H) Logging & Diagnostics
- ✅ Structured logging system (`/lib/demo/logger.ts`)
- ✅ Performance metrics and health monitoring
- ✅ Error tracking and diagnostics dashboard

## 🎮 Bot Strategies Explained

### Early Strategy 🏃‍♂️
- Bids early and often in the first half of the auction
- Creates initial momentum and competition
- Backs off as auction progresses

### Mid Strategy ⚖️
- Waits for some activity before joining
- Bids during the middle phase when interest builds
- Balanced approach to bidding

### Sniper Strategy 🎯
- Waits until final 30 seconds
- Places strategic last-minute bids
- Triggers anti-sniping extensions

### Chaser Strategy 🏃‍♀️
- Follows other bidders aggressively
- Always tries to outbid recent activity
- Creates competitive bidding wars

## ⚡ Anti-Sniping System

### How It Works
1. **Soft Close Window**: Last 30 seconds of auction
2. **Trigger Detection**: New bid placed during soft close
3. **Extension**: Auction extended by 60 seconds
4. **Real-time Notification**: All participants notified instantly
5. **Multiple Extensions**: Can trigger multiple times

### Configuration
```typescript
LOT_DURATION_SEC: 420,        // 7 minutes base duration
SOFT_CLOSE_WINDOW_SEC: 30,    // Last 30 seconds
SOFT_CLOSE_EXTEND_SEC: 60,    // Extend by 60 seconds
```

## 🔍 Monitoring & Diagnostics

### Admin Dashboard Features
- **Live Auction Timers**: Real-time countdown and bidding
- **System Metrics**: Uptime, memory, bid rates
- **Recent Activity**: Live bid feed with bot identification
- **Error Monitoring**: Real-time error tracking
- **Performance Metrics**: Response times and throughput

### Log Categories
- `auction_timer`: Lot progression and timing events
- `bidding_bot`: Bot decision-making and bid placement
- `demo_control`: System start/stop and configuration
- `realtime`: WebSocket and channel events
- `database`: Database operations and queries
- `performance`: Timing and resource usage
- `error`: Error conditions and recovery

### CLI Status Commands
```bash
# Show current demo status
pnpm tsx scripts/demo-run.ts --status

# Stop demo mode
pnpm tsx scripts/demo-run.ts --stop

# View logs (if using PM2)
pm2 logs auction-timer
pm2 logs bidding-bots
```

## 🛡️ Safety Features

### Production Protection
- Demo mode automatically disabled in production
- Requires explicit `DEMO_MODE=true` environment variable
- All demo data clearly labeled and isolated

### Data Safety
- Demo data clearly marked with `demo_label`
- Reset requires explicit confirmation
- Separate from production auction data

### Resource Management
- Configurable bot limits and timing
- Memory usage monitoring
- Automatic cleanup on shutdown

## 🎛️ Configuration Options

### Timing Controls
```typescript
LOT_DURATION_SEC: 420,           // 7 minutes per lot
SOFT_CLOSE_WINDOW_SEC: 30,       // Anti-snipe window
SOFT_CLOSE_EXTEND_SEC: 60,       // Extension time
TIMER_TICK_INTERVAL_MS: 1000,    // UI update frequency
```

### Bot Controls
```typescript
NUM_BOT_BIDDERS: 14,             // Number of bots
BOT_MAX_BID_ITC: 1500,           // Max bot bid amount
BOT_THROTTLE_MS: [4000, 12000],  // Delay between bids
BOT_BID_INCREMENT_MIN: 0.02,     // Min 2% increment
BOT_BID_INCREMENT_MAX: 0.07,     // Max 7% increment
```

### Scale Controls
```typescript
NUM_AUCTIONEERS: 3,              // Number of auction houses
AUCTIONS_PER_AUCTIONEER: 2,      // Auctions per house
LOTS_PER_AUCTION: 12,            // Items per auction
```

## 🧪 Testing

### Run Demo Tests
```bash
# Run all demo tests
npm test -- __tests__/demo/

# Run specific test suites
npm test -- __tests__/demo/demo-system.test.ts
npm test -- __tests__/demo/auction-timer.test.ts
npm test -- __tests__/demo/bidding-bots.test.ts
```

### Manual Testing Checklist
- [ ] Demo reset and seeding works
- [ ] Auctions start with timers
- [ ] Bots place realistic bids
- [ ] Anti-sniping triggers correctly
- [ ] Real-time updates work
- [ ] Admin controls function
- [ ] Logging captures events
- [ ] System handles errors gracefully

## 🔧 Troubleshooting

### Common Issues

**"No auctions found"**
```bash
# Reset and reseed data
pnpm tsx scripts/demo-run.ts --reset --yes
```

**Bots not bidding**
```bash
# Check bot worker status
pm2 status
pm2 restart bidding-bots

# Or restart via API
curl -X POST localhost:3000/api/demo/control -d '{"action":"start"}'
```

**Timers not updating**
```bash
# Check timer worker
pm2 restart auction-timer

# Check real-time connections in browser dev tools
```

**High error rates**
- Check database connectivity
- Verify environment variables
- Review error logs in admin dashboard

### Debug Commands
```bash
# View detailed status
pnpm tsx scripts/demo-run.ts --status

# Check worker logs
pm2 logs --lines 100

# Test database connection
supabase status
```

## 🎉 Success Metrics

When working correctly, you should see:
- ✅ Multiple auctions running simultaneously
- ✅ Real-time countdown timers
- ✅ Bots bidding with different strategies
- ✅ Anti-sniping extensions happening
- ✅ Smooth lot transitions
- ✅ Live activity feed updating
- ✅ Zero critical errors in diagnostics

## 🚀 Production Deployment

### Environment Setup
```bash
# Production environment
NODE_ENV=production
DEMO_MODE=false  # Important: Disable in production

# Use PM2 for worker management
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Ecosystem Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'auction-timer',
    script: 'workers/auction-timer.ts',
    instances: 1,
    exec_mode: 'fork'
  }, {
    name: 'bidding-bots',
    script: 'workers/bidding-bots.ts',
    instances: 1,
    exec_mode: 'fork'
  }]
}
```

## 📖 API Reference

### Demo Control API
```bash
# Start demo
curl -X POST /api/demo/control -d '{"action":"start"}'

# Stop demo
curl -X POST /api/demo/control -d '{"action":"stop"}'

# Reset demo
curl -X POST /api/demo/control -d '{"action":"reset"}'

# Get status
curl /api/demo/control
```

### Logs API
```bash
# Get recent logs
curl '/api/demo/logs?action=recent&limit=50'

# Get error summary
curl '/api/demo/logs?action=errors'

# Get system metrics
curl '/api/demo/logs?action=metrics'
```

## 🎯 Demo Flow Summary

1. **Setup**: Environment variables and database ready
2. **Reset**: Clear old data, seed fresh auction data
3. **Start**: Activate auctions and start worker processes
4. **Watch**: Real-time bidding with bots and anti-sniping
5. **Monitor**: Admin dashboard tracks system health
6. **Stop**: Clean shutdown when demonstration complete

The system is now complete and ready for live auction demonstrations! 🎉