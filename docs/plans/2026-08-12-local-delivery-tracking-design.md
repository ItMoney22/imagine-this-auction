# Local Delivery — End-to-End Package & Delivery Tracking

**Date:** 2026-08-12 · **Status:** approved (David: admin-created drivers, invoice-attached deliveries, Google Maps)

## What this is

Local delivery fulfillment for won-lot invoices, as an alternative to the existing
"mark as shipped" flow. Every delivery gets a unique tracking number
(`ITA-XXXXXXXXXX`) and an append-only event timeline from warehouse scan to
proof-of-delivery. Three surfaces: customer tracking page, driver delivery screen,
admin/warehouse dashboard.

## Decisions

- **Drivers** are platform users with a new `driver` role, created/managed by admins
  from the dashboard. No self-signup in v1.
- **Deliveries hang off invoices** (one per invoice). The auctioneer's location is the
  "warehouse"; the auctioneer or an admin performs the scan-and-measure step that
  creates the delivery. `invoices.tracking_number` mirrors the delivery tracking
  number so existing UI keeps working; `invoices.fulfillment_method` records
  `shipping` vs `local_delivery`.
- **Map**: Google Maps JS on the admin dashboard, keyed by
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; graceful fallback (coordinates + links) until a
  key is set.
- **Real-time**: Supabase Realtime (`postgres_changes` on `delivery_events`) for
  admin/driver screens with a polling fallback; the customer page polls the tracking
  API (token visitors are anonymous, so RLS-based realtime can't reach them).
- **Privacy**: customer surface never gets driver name/phone/photo or live GPS —
  only coarse status + ETA window. Delivered GPS is stored for audit, shown to
  admin only. Secure tracking links use a random 48-hex token; the logged-in buyer
  can view without the token.
- **Location tracking**: browser geolocation pings only while a driver has an active
  job (`claimed → out_for_delivery`), gated on explicit stored consent
  (`drivers.location_consent_at`), stopped by terminal status, revocation, or
  closing the screen. Ping rows are retained as audit records.

## Data model (migrations 017 STEP1 + 018 STEP2, run manually — DDL blocked for agents)

- `user_role` enum + `'driver'` (STEP1, separate transaction).
- `drivers`: user_id, status, vehicle_type, phone, notes, location_consent_at.
- `deliveries`: invoice_id (unique), tracking_number (unique), tracking_token
  (unique), package barcode + weight_g + dims, pickup/dropoff jsonb, status, driver_id,
  eta_window_start/end, delivered_at, recipient_name, signature_required,
  proof_photo_path, signature_path, delivered_lat/lng, delivery_notes.
- `delivery_events`: delivery_id, event_type, actor_user_id, actor_role, notes,
  photo_path, lat/lng, metadata jsonb, created_at — append-only audit trail.
- `delivery_offers`: delivery_id × driver_id, status sent/declined/expired/claimed.
- `driver_locations`: delivery_id, driver_id, lat/lng/accuracy_m, recorded_at.
- Storage bucket `delivery-proofs` (private; served via signed URLs).
- RLS: admin ALL; drivers SELECT their own rows; buyers SELECT their own deliveries
  (read-only). All writes go through service-role API routes.
- `deliveries` + `delivery_events` added to the realtime publication.

## Status machine

`created → offered → claimed → arrived → picked_up → out_for_delivery → delivered`
Branches: any active status → `exception` (reason: customer_unavailable,
unsafe_location, damaged_item, wrong_address, vehicle_issue, other) → admin resolves
to `returned`, `cancelled`, or back to `offered` (re-offer). Admin may `cancel`
any non-terminal delivery. Transitions are enforced server-side in
`lib/delivery/state.ts`; every transition writes a `delivery_events` row.

## Enforcement points

- Driver cannot claim unless an un-expired offer exists and delivery is `offered`
  (atomic claim guards the race).
- Driver cannot mark `out_for_delivery` before `picked_up`; `picked_up` requires
  scanning the package barcode (browser `BarcodeDetector`, same pattern as
  Quick List) and the scanned value must match.
- `delivered` requires proof photo; recipient name/signature when
  `signature_required`; server stamps time and stores GPS if provided.
- Exceptions require a reason; photos/notes optional but supported.

## Surfaces

- `/track/[trackingNumber]?t=<token>` — public tracking page (simple status hero,
  ETA window, timeline; 30s polling).
- `/driver` + `/driver/jobs/[id]` — driver home (offers + active jobs) and the
  delivery screen (arrive / scan-to-pickup / out-for-delivery / deliver with
  photo+signature / report exception; consent-gated location pings).
- `/admin/deliveries` — search (order #, barcode, tracking #, customer, driver),
  table + detail: timeline audit trail, Google Map (driver path + latest position),
  exception resolution, driver contact info, reassign.
- Buyer invoices dashboard gains a "Track package" link; auctioneer invoice manager
  gains "Arrange local delivery" (scan-and-measure form) on paid invoices.

## APIs (all writes via service-role client; session/role checked per route)

- `POST /api/delivery` (admin/owning auctioneer) — create from invoice.
- `GET /api/delivery?q=` (admin) — search; `GET /api/delivery/[id]` — detail.
- `POST /api/delivery/[id]/actions` (admin) — offer / assign / reassign / handoff /
  cancel / resolve_exception.
- `GET /api/driver/jobs`, `POST /api/driver/jobs/[id]` (driver) — claim / arrive /
  pickup_scan / out_for_delivery / deliver / exception.
- `POST /api/driver/location` (driver, consent + active job required).
- `POST /api/driver/consent` (driver).
- `GET /api/track/[trackingNumber]` (public with token, or buyer session) —
  sanitized timeline.

Driver offers and customer status changes insert `notifications` rows, so the
existing email/push delivery pipeline sends them with no extra plumbing.
