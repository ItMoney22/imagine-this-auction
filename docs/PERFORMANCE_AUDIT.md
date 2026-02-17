# Imagine This Auction - Performance, Load, & Reliability Audit

**Date**: 02/14/2026
**Auditor**: Zero (MetaBuilder AI)
**Project**: ImagineThisAuction
**Stack**: Next.js 15 + React 19 + Supabase + TypeScript
**Deployment**: VPS (168.231.69.85) via PM2 + Nginx

---

## Executive Summary

ImagineThisAuction is a feature-complete real-time auction platform. This document audits three critical areas: **real-time bidding performance**, **load handling capacity**, and **uptime reliability**. The architecture uses Supabase Realtime (WebSockets) for live bidding, PostgreSQL atomic functions for data integrity, and PM2/Nginx for process management.

**Overall Assessment**: The platform has solid foundational architecture but needs several improvements before handling production-scale traffic. Key concerns are single-instance PM2 deployment, missing rate limiting, no external health monitoring, and no load testing data.

---

## 1. Real-Time Bidding Performance

### 1.1 Architecture Overview

```
Client Browser
    ↓ WebSocket (Supabase Realtime)
    ↓
Supabase Realtime Server
    ↓ postgres_changes listener
    ↓
PostgreSQL (bids table INSERT event)
    ↑
    ↑ RPC: atomic_place_bid()
    ↑
Next.js API Route (bid submission)
    ↑ HTTP POST
    ↑
Client Browser (bid form submit)
```

### 1.2 Bid Placement Flow

**Latency Chain** (estimated per-hop):

| Step | Operation | Est. Latency |
|------|-----------|-------------|
| 1 | Client → Next.js API | 5-50ms (network) |
| 2 | API → Supabase RPC `atomic_place_bid()` | 10-30ms |
| 3 | PostgreSQL transaction (bid + wallet + refund) | 5-15ms |
| 4 | Supabase Realtime → all subscribers | 50-150ms |
| 5 | Client re-render with new bid | 5-20ms |
| **Total** | **End-to-end bid visibility** | **~75-265ms** |

### 1.3 Atomic Bid Function Analysis

**File**: `supabase/migrations/0001_full_schema.sql` — `atomic_place_bid()`

**Strengths**:
- Single PostgreSQL function handles the entire bid lifecycle atomically
- Validates auth, auction status, bid amount, minimum increment, and wallet balance
- Auto-refunds previous highest bidder within the same transaction
- Anti-sniping extension built into the same atomic operation
- `SECURITY DEFINER` ensures consistent permissions

**Weaknesses**:
- **No row-level locking**: Missing `SELECT ... FOR UPDATE` on the lot row — under high concurrency, two bids could read the same `current_high_bid` simultaneously, creating a race condition
- **Wallet balance check is non-locking**: `get_wallet_balance()` reads the latest ledger entry but doesn't lock it, so concurrent bids from the same user could overdraw
- **No bid deduplication**: No idempotency key — network retries could create duplicate bids
- **Single-point refund**: Refunding the previous bidder relies on `is_winning = true` flag — if two bids arrive near-simultaneously, the refund logic could misfire

**Recommendation**: Add `FOR UPDATE` lock on the lot row at the start of `atomic_place_bid()`:
```sql
SELECT * INTO lot_record FROM lots WHERE id = lot_uuid FOR UPDATE;
```

### 1.4 Real-Time Subscription (Client-Side)

**File**: `components/marketplace/bidding-panel.tsx`

**Strengths**:
- Subscribes to `postgres_changes` on the `bids` table filtered by `lot_id`
- Real-time toast notifications for outbid events
- Client-side anti-snipe timer extension
- Proper cleanup via `supabase.removeChannel()` on unmount

**Weaknesses**:
- **Secondary query per bid**: Each incoming bid triggers a `supabase.from('users').select()` to fetch the bidder's name — this N+1 pattern adds latency and load
- **Stale closure risk**: The `useEffect` dependency array includes `bids` and `auctionEndTime`, causing the subscription to be re-created on every bid — potential for missed events during re-subscribe
- **No reconnection handling**: If the WebSocket disconnects (network hiccup), there's no explicit reconnect logic or state reconciliation
- **No optimistic updates**: Bid placement waits for the Supabase RPC round-trip before showing any feedback

### 1.5 Anti-Sniping System

**File**: `workers/auction-timer.ts`

| Parameter | Value |
|-----------|-------|
| Soft close window | 30 seconds before end |
| Extension duration | 60 seconds per trigger |
| Multiple extensions | Supported (re-triggers on each bid in window) |

**Strengths**:
- Server-side enforcement via the timer worker (not just client-side)
- Database-persisted extension (`lot_ends_at` updated in DB)
- Broadcasts `anti_snipe` event to all connected clients
- Health check detects orphaned lots every 30 seconds

**Weaknesses**:
- `soft_close_triggered` flag is set to `true` and never reset — meaning only ONE extension per lot. The code comment says "multiple extensions" but the flag prevents it
- Timer worker runs as a separate process with its own Supabase client — if it crashes, anti-sniping stops silently
- No persistent queue — if the worker restarts, in-flight extensions could be lost (mitigated by `syncWithDatabase()` on health check)

### 1.6 Timer Worker Performance

**File**: `workers/auction-timer.ts`

- Broadcasts timer ticks every 1000ms per active lot via Supabase Realtime
- Health check interval: 30 seconds (DB connectivity + orphan detection + state sync)
- Per-lot `setTimeout` for end-of-auction — O(n) timers where n = active lots

**Scaling Concern**: With 100+ concurrent lots, the timer tick loop sends 100+ broadcasts per second. Each broadcast is a Supabase channel `.send()` call. This could saturate the Supabase Realtime connection limit.

---

## 2. Load Handling

### 2.1 Current Infrastructure

| Component | Configuration | Limit |
|-----------|--------------|-------|
| PM2 instances | **1** (single process) | 1 core utilized |
| Nginx | Reverse proxy on port 80 → 8080 | Gzip enabled, 50MB upload |
| Memory limit | 1GB per PM2 process | Auto-restart on breach |
| Supabase | Free/Pro tier (unknown) | 500 concurrent Realtime connections (Pro) |
| VPS | Ubuntu, unknown specs | Unknown CPU/RAM |

### 2.2 Concurrency Bottlenecks

**Critical**: PM2 is configured with `instances: 1`. This means:
- All HTTP requests are handled by a **single Node.js event loop**
- A blocking operation (heavy DB query, image processing) blocks ALL requests
- No horizontal scaling within the VPS

**Recommendation**: Scale PM2 to cluster mode:
```javascript
// ecosystem.config.js
instances: 'max',  // or a specific number like 4
exec_mode: 'cluster'
```

### 2.3 Database Performance

**19 indexes** are defined for critical query paths:

| Index | Purpose | Impact |
|-------|---------|--------|
| `idx_bids_lot_created_desc` | Bid history by lot (newest first) | High — every bid placement |
| `idx_bids_winning` | Partial index for winning bids only | High — bid refund lookups |
| `idx_wallet_ledger_user_created_desc` | Wallet balance lookups | High — every bid |
| `idx_auctions_status_timing` | Live auction queries | Medium — page loads |
| `idx_stripe_events_processed` | Unprocessed webhook dequeue | Low — payment events |

**Missing Indexes**:
- No index on `lots.status` + `lots.demo_label` — the timer worker queries this combination frequently
- No index on `bids.user_id` + `bids.lot_id` — needed for "am I the highest bidder?" checks

**Recommendation**:
```sql
CREATE INDEX idx_lots_status_demo ON lots(status, demo_label) WHERE demo_label IS NOT NULL;
CREATE INDEX idx_bids_user_lot ON bids(bidder_id, lot_id, created_at DESC);
```

### 2.4 Estimated Load Capacity (Theoretical)

Based on the current single-instance architecture:

| Metric | Estimated Capacity | Rationale |
|--------|-------------------|-----------|
| Concurrent WebSocket connections | ~200-500 | Supabase Pro tier limit |
| Bids per second (sustained) | ~50-100 | Single Node.js process + Supabase RPC |
| Bids per second (burst) | ~200 | PostgreSQL can handle the DB side |
| Concurrent active auctions | ~20-50 | Timer worker broadcasts per second |
| Concurrent active bidders | ~100-300 | WebSocket + HTTP combined |
| Page loads per second | ~200-500 | Next.js SSR + static caching |

**Note**: These are rough estimates. No actual load tests have been run. Real numbers could be significantly lower.

### 2.5 Bot System Load Profile

**File**: `workers/bidding-bots.ts`

The demo bot system generates realistic load:

| Parameter | Value | Load Impact |
|-----------|-------|-------------|
| Bot count | 14 | 14 concurrent "users" |
| Thinking loop | 2-5 second cycle | ~3-7 bid evaluations/second |
| Throttle per bot | 4-12 seconds between bids | Max ~3.5 bids/sec across all bots |
| Bid increment | 2-7% of current price | Natural price escalation |

**Key insight**: The bot system calls `fetch()` to the `/api/bids` endpoint rather than using Supabase RPC directly. This means bot bids go through the full HTTP stack (Nginx → Next.js → Supabase), which is good for realistic load testing but adds unnecessary latency for demo purposes.

### 2.6 Missing Load Handling Features

| Feature | Status | Priority |
|---------|--------|----------|
| Rate limiting (per-user bid frequency) | **Missing** | Critical |
| Request queuing / backpressure | **Missing** | High |
| CDN for static assets | Partial (Nginx cache) | Medium |
| Database connection pooling | Supabase default | Medium |
| WebSocket connection limits | No app-level enforcement | Medium |
| Graceful degradation | **Missing** | Medium |
| Horizontal scaling (multi-server) | **Not configured** | Low (pre-launch) |

---

## 3. Uptime Reliability

### 3.1 Current Monitoring

| Tool | What It Monitors | Alerting |
|------|-----------------|----------|
| PM2 | Process alive/dead, memory, restarts | Terminal only |
| Nginx | HTTP errors (access/error logs) | Log files only |
| Health endpoint (`/api/health`) | Returns `{ok: true}` | **No external polling** |
| Timer worker health check | DB connectivity, orphan lots | Console logs only |

**Critical Gap**: There is **no external uptime monitoring**. If the VPS goes down, nobody is notified automatically.

### 3.2 Failure Modes Analysis

| Failure | Impact | Recovery | MTTR |
|---------|--------|----------|------|
| Next.js process crash | All HTTP + SSR down | PM2 auto-restart | ~5-10 seconds |
| Timer worker crash | Anti-sniping + lot progression stops | **Manual restart required** | Unknown (undetected) |
| Bot worker crash | Demo bots stop bidding | **Manual restart required** | Unknown (undetected) |
| Supabase outage | All DB + Realtime dead | Wait for Supabase recovery | External dependency |
| Nginx crash | All traffic blocked | systemd auto-restart | ~2-5 seconds |
| VPS crash | Everything down | **Manual VPS restart** | Minutes to hours |
| Memory leak | Gradual slowdown → OOM kill | PM2 `max_memory_restart: 1G` | ~10-30 seconds |
| WebSocket disconnect | Users see stale data | **No auto-reconnect** | Until page refresh |

### 3.3 Data Integrity Safeguards

| Mechanism | Implementation | Effectiveness |
|-----------|---------------|---------------|
| Atomic bid placement | PostgreSQL function | Strong (single-connection) |
| Wallet balance consistency | Running balance in `wallet_ledger` | Good (but no FOR UPDATE lock) |
| Stripe idempotency | `stripe_events` table with unique event ID | Strong |
| Audit logging | `audit_log` table with old/new values | Good (write-only) |
| RLS policies | 24 policies across 10 tables | Strong |
| Input validation | Bid amount, reserve price, timing constraints | Good (DB-level CHECK constraints) |

### 3.4 Graceful Shutdown

Both workers (`auction-timer.ts`, `bidding-bots.ts`) handle:
- `SIGINT` — Ctrl+C
- `SIGTERM` — PM2 stop
- `SIGUSR2` — PM2 reload

On shutdown, they:
1. Set `isRunning = false`
2. Clear all timers
3. Close all Realtime channels
4. Clear in-memory state

**Gap**: No "drain" phase — active bids being processed during shutdown could be lost.

### 3.5 Deployment Risk

**Current deployment process** (from VPS_DEPLOYMENT.md):
```bash
git pull origin main
npm install
npm run build
pm2 restart imagine-web
```

**Risks**:
- **Zero-downtime deploys not configured** — `pm2 restart` causes a brief outage
- Build failure leaves the app in a broken state (no rollback)
- `npm install` in production can introduce untested dependencies
- No staging environment documented

**Recommendation**: Use PM2 zero-downtime reload:
```bash
pm2 reload imagine-web  # graceful reload, not restart
```

### 3.6 Uptime Improvement Roadmap

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Add external uptime monitor (UptimeRobot, Better Stack) | 15 min | Immediate alerting |
| P0 | Add PM2 cluster mode (`instances: 'max'`) | 5 min | 2-4x throughput |
| P0 | Add `FOR UPDATE` lock in `atomic_place_bid()` | 10 min | Prevents race conditions |
| P1 | Add rate limiting middleware (per-user, per-IP) | 2 hrs | Prevents abuse |
| P1 | Add WebSocket reconnection logic in `bidding-panel.tsx` | 1 hr | Handles network drops |
| P1 | Fix `soft_close_triggered` flag (allow re-triggering) | 30 min | Correct anti-snipe behavior |
| P1 | Add PM2 process management for timer + bot workers | 30 min | Auto-restart on crash |
| P2 | Remove N+1 query in bid subscription (join user data) | 1 hr | Reduces DB load |
| P2 | Add request queue / backpressure on bid endpoint | 3 hrs | Handles burst traffic |
| P2 | Set up staging environment | 2 hrs | Safer deployments |
| P3 | Implement blue-green deployments | 4 hrs | Zero-downtime updates |
| P3 | Add application performance monitoring (APM) | 2 hrs | Detailed metrics |
| P3 | Load test with k6 or Artillery | 3 hrs | Real capacity numbers |

---

## 4. Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Real-Time Bid Latency** | 7/10 | Good architecture, ~100-250ms end-to-end. Race condition risk under load |
| **Anti-Sniping Reliability** | 6/10 | Server-enforced but single-trigger bug, worker crash = silent failure |
| **Concurrent Load Handling** | 4/10 | Single PM2 instance, no rate limiting, no load testing data |
| **Data Integrity** | 8/10 | Atomic DB functions, RLS, audit log. Missing row-level locks |
| **Uptime Monitoring** | 2/10 | No external monitoring, no alerting, manual worker management |
| **Deployment Safety** | 3/10 | No rollback, no staging, brief downtime on deploy |
| **Scalability Readiness** | 5/10 | Supabase handles DB scaling, but app layer is single-node |
| **Overall** | **5/10** | Solid MVP architecture, needs hardening before production traffic |

---

## 5. Critical Path for Production Readiness

### Must-Have (Before Launch)
1. External uptime monitoring with Telegram/email alerts
2. PM2 cluster mode for the Next.js app
3. PM2 management for timer + bot workers (add to ecosystem.config.js)
4. Row-level locking in `atomic_place_bid()`
5. Rate limiting on bid submission endpoint
6. WebSocket reconnection handling in the client

### Should-Have (First Month)
7. Load testing with realistic traffic patterns
8. Application performance monitoring (Sentry, Datadog, or similar)
9. Staging environment with production-like data
10. Zero-downtime deployment pipeline
11. Fix soft-close re-triggering logic

### Nice-to-Have (Optimization)
12. CDN for static assets
13. Database query optimization (eliminate N+1 patterns)
14. Horizontal scaling documentation
15. Chaos engineering tests (kill workers, simulate Supabase outage)

---

*Generated by Zero — MetaBuilder AI Team*
*Last Updated: 02/14/2026*
