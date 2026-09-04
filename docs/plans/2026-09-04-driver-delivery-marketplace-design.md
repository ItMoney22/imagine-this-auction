# Driver Delivery Marketplace — self-signup drivers, job board, pings, payouts

**Date:** 2026-09-04 · **Status:** approved by David (sections 1–3 reviewed live)
**Builds on:** `docs/plans/2026-08-12-local-delivery-tracking-design.md` (migrations 017/018,
`lib/delivery/state.ts`, `/driver`, `/admin/deliveries`, `/track/[tn]`)

## Why

Most auctioneers force winners to come pick everything up. Imagine This Auction offers local
delivery as a platform service: buyers pay a quoted price at checkout, vetted contractor drivers
claim jobs from a board, and the auctioneer only scans, measures, and hands the package over.
Nobody in the HiBid / Proxibid / LiveAuctioneers tier does this.

## Decisions (David, 2026-09-04)

| Question | Decision |
|---|---|
| Who pays, who gets paid | **Buyer pays ITA** on ITA's own merchant account (NMI, card on file). **ITA pays the driver**; ITA keeps ~20%. Auctioneer touches no delivery money. |
| Driver vetting | **Self-signup + documents + admin approval.** License, insurance, vehicle photo, contractor agreement, W-9 via Stripe. No paid background check in v1. |
| Pricing | **Size tier + distance, fixed driver share.** Tiers Small (sedan) / Medium (SUV) / Large (truck or van) / XL (two-person). Base fee + per-mile, admin-editable, driver share default 80%. |
| Driver payouts | **Stripe Connect Express, drivers only.** Handles identity, bank, 1099. Card payments stay on PaymentCloud/NMI. |
| Batching | Deferred to phase 5 (runs = several deliveries from one pickup). Data model leaves room. |

## What already exists (built 2026-08-12, not yet live)

Driver role; `drivers`, `deliveries`, `delivery_events`, `delivery_offers`, `driver_locations`;
status machine `created → offered → claimed → arrived → picked_up → out_for_delivery → delivered`
with `exception / returned / cancelled / failed`; scan-to-pickup, photo proof, signature,
consent-gated GPS pings; `/driver` (offers + active jobs) and `/driver/jobs/[id]`;
`/admin/deliveries` with Google Map, audit trail, reassign, driver roster; `/track/[tn]?t=`
customer page; notifications rows drive email/push. **Blocked on running migrations 017 + 018.**

## New data

- `drivers` + `application_status` (`pending|approved|rejected|suspended`), `vehicle_class`
  (`small|medium|large|xl`), `plate`, `service_zip`, `service_radius_mi`, `service_lat/lng`,
  `license_path`, `insurance_path`, `vehicle_photo_path`, `agreement_accepted_at`,
  `sms_opt_in`, `online` (bool, schedule toggle), `stripe_account_id`, `payouts_enabled`,
  `approved_at`, `approved_by`, `review_notes`.
- `delivery_rates` (admin-editable, no deploy): `tier`, `base_cents`, `per_mile_cents`,
  `driver_share_pct`, `max_declared_value_cents`, `active`.
- `deliveries` + `tier`, `distance_mi`, `pickup_lat/lng`, `dropoff_lat/lng`, `price_cents`,
  `driver_payout_cents`, `platform_fee_cents`, `declared_value_cents`, `payment_event_id`
  (buyer charge on ITA MID), `pickup_by`, `wave` (1–3), `wave_expires_at`.
- `delivery_offers` + `expires_at`, `wave`.
- `driver_payouts`: `delivery_id`, `driver_id`, `amount_cents`, `status`
  (`pending|held|paid|failed`), `stripe_transfer_id`, `held_reason`, `paid_at`.
- `delivery_claims` (damage): `delivery_id`, `buyer_id`, `reason`, `photos`, `status`
  (`open|approved|denied`), `resolved_by`, `resolution_notes`, `created_at` (48 h window).
- Storage: `driver-documents` private bucket, signed URLs only (same pattern as
  `auctioneer-licenses`, but WITH explicit `storage.objects` policies this time).

## Flows

**Quote and checkout (buyer).** On a paid invoice the buyer chooses "Local delivery". Server
geocodes auctioneer pickup + buyer address (Google Geocoding; Distance Matrix for road miles),
looks up the tier the auctioneer set at scan-and-measure (default from package dims/weight),
computes `price = base + miles × per_mile`, shows it, charges the buyer's vault token on the ITA
`processor_id`, writes `payment_events`, creates the delivery as `created` and immediately
`offered` (wave 1). Refund path: cancel before `picked_up` refunds in full; after pickup, admin
decides.

**Matching and pings.** Eligible = approved + payouts_enabled + online + `vehicle_class` rank ≥
tier rank + pickup inside the driver's service circle + declared value ≤ tier cap. Wave 1: eligible
drivers within 10 mi of pickup, nearest first; wave 2 after 10 min: 25 mi; wave 3: everyone
eligible. Each wave inserts `delivery_offers` (with `expires_at`) and `notifications` rows
(email/push via the existing pipeline) plus SMS via Twilio for `sms_opt_in` drivers. Claim is
atomic (`UPDATE … WHERE status='offered'` guard) so two taps cannot both win. Admin can assign by
hand at any wave (exists). Unclaimed after wave 3 → admin exception queue.

**Job board (driver).** New "Open jobs" tab on `/driver`: unclaimed jobs in range, sorted by
distance, each showing tier, pickup town, drop-off town, distance, **exact payout**, pickup-by
window. Tap → map preview → Claim. Claimed jobs flow into the existing active list and job screen
(arrive / scan / out for delivery / deliver / exception). Additions: earnings strip (today,
week, Stripe payout status) and an online/offline toggle.

**Payout.** On `delivered`, insert `driver_payouts` pending → Stripe transfer to the driver's
Connect account (weekly batch cron; instant later). If a damage claim is open on the delivery,
payout goes to `held` until resolved.

**Driver onboarding.** Public `/drive` page → signup (role `driver`, `application_status =
pending`) → application form (name, phone, vehicle class, plate, service ZIP + radius, license,
insurance, vehicle photo, contractor agreement checkbox, location + SMS consents) → admin
"Drivers" tab (pending list, doc viewer via signed URL, approve / reject / suspend with notes,
audit row) → approval sends the Stripe Connect Express onboarding link → driver can claim once
Stripe reports `payouts_enabled`.

**Safety.** Per-tier declared-value cap; damage claims within 48 h reviewed against pickup and
delivery photos; drivers are contractors with their own auto insurance (agreement states it);
cargo insurance is a later business decision, not code. Existing privacy rules stay: buyers never
see driver identity or live GPS.

## Admin

Rates editor · driver applications · live map of active jobs · wave state per delivery · manual
assign · exception queue · payout ledger with Stripe transfer IDs · damage-claims queue.

## Testing

Unit: quote math, eligibility filter, wave escalation, atomic claim, payout hold on open claim.
Playwright: buyer requests delivery → driver claims → scans → delivers → payout row appears.
Existing `tests/unit` runner (`npm run test:unit`).

## Phases

1. **Ship what exists** — David runs pending SQL 017 + 018; deploy; smoke-test driver flow.
2. **Rates, quote, buyer checkout, self-signup + approval** (needs NMI vault + ITA processor_id
   from the card-on-file build).
3. **Job board, ping waves, SMS, online toggle.**
4. **Stripe Connect payouts, earnings strip, damage claims, payout holds.**
5. **Batching into runs** (one driver, one pickup, many drop-offs).

Dependencies: phase 2 needs the NMI card-on-file work (board row 7bd7a35c) and the RLS fix
(22b859ac). Google Maps key already wired for the admin map; Geocoding + Distance Matrix must be
enabled on the same key.
