-- 018_local_delivery_step2_schema.sql
-- Local Delivery tracking — STEP 2 of 2. Run AFTER step 1 (driver enum value).
-- Design: docs/plans/2026-08-12-local-delivery-tracking-design.md

-- ─── Drivers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  vehicle_type TEXT,
  phone TEXT,
  notes TEXT,
  -- Explicit location-tracking consent. NULL = not granted. Pings are refused
  -- server-side unless this is set; drivers can revoke at any time.
  location_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Deliveries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES public.lots(id),
  customer_user_id UUID NOT NULL REFERENCES public.users(id),
  auctioneer_id UUID REFERENCES public.auctioneers(id),
  tracking_number TEXT NOT NULL UNIQUE,
  -- Secret for the customer tracking link (unguessable, revocable by rotation)
  tracking_token TEXT NOT NULL UNIQUE,
  package_barcode TEXT NOT NULL,
  weight_g INTEGER,
  length_mm INTEGER,
  width_mm INTEGER,
  height_mm INTEGER,
  pickup_address JSONB,
  dropoff_address JSONB,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'offered', 'claimed', 'arrived', 'picked_up',
    'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled', 'failed'
  )),
  driver_id UUID REFERENCES public.drivers(id),
  offer_expires_at TIMESTAMPTZ,
  eta_window_start TIMESTAMPTZ,
  eta_window_end TIMESTAMPTZ,
  signature_required BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ,
  recipient_name TEXT,
  delivery_notes TEXT,
  proof_photo_path TEXT,
  signature_path TEXT,
  delivered_lat DOUBLE PRECISION,
  delivered_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON public.deliveries (driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON public.deliveries (customer_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_barcode ON public.deliveries (package_barcode);

-- ─── Event timeline (append-only audit trail) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.users(id),
  actor_role TEXT,
  notes TEXT,
  photo_path TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery
  ON public.delivery_events (delivery_id, created_at);

-- ─── Offers to drivers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'declined', 'expired', 'claimed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (delivery_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_offers_driver ON public.delivery_offers (driver_id, status);

-- ─── Location pings (only while actively on a delivery, with consent) ───────
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_delivery
  ON public.driver_locations (delivery_id, recorded_at);

-- ─── Invoices: fulfillment method ───────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fulfillment_method TEXT NOT NULL DEFAULT 'shipping';
DO $$
BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_fulfillment_method_check
    CHECK (fulfillment_method IN ('shipping', 'local_delivery'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── updated_at triggers ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_drivers_updated_at ON public.drivers;
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_deliveries_updated_at ON public.deliveries;
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- All writes go through service-role API routes (which bypass RLS). Policies
-- below grant only the reads each role needs (also powers Realtime).
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage drivers" ON public.drivers;
CREATE POLICY "Admins manage drivers" ON public.drivers
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read own profile" ON public.drivers;
CREATE POLICY "Drivers read own profile" ON public.drivers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read deliveries" ON public.deliveries;
CREATE POLICY "Admins read deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read assigned deliveries" ON public.deliveries;
CREATE POLICY "Drivers read assigned deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Buyers read own deliveries" ON public.deliveries;
CREATE POLICY "Buyers read own deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (customer_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read delivery events" ON public.delivery_events;
CREATE POLICY "Admins read delivery events" ON public.delivery_events
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read events for assigned deliveries" ON public.delivery_events;
CREATE POLICY "Drivers read events for assigned deliveries" ON public.delivery_events
  FOR SELECT TO authenticated USING (
    delivery_id IN (
      SELECT d.id FROM public.deliveries d
      JOIN public.drivers dr ON dr.id = d.driver_id
      WHERE dr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read offers" ON public.delivery_offers;
CREATE POLICY "Admins read offers" ON public.delivery_offers
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read own offers" ON public.delivery_offers;
CREATE POLICY "Drivers read own offers" ON public.delivery_offers
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins read driver locations" ON public.driver_locations;
CREATE POLICY "Admins read driver locations" ON public.driver_locations
  FOR SELECT TO authenticated USING (get_user_role() = 'admin'::user_role);
DROP POLICY IF EXISTS "Drivers read own locations" ON public.driver_locations;
CREATE POLICY "Drivers read own locations" ON public.driver_locations
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Storage bucket for proof photos / signatures (private) ─────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-proofs', 'delivery-proofs', false)
ON CONFLICT (id) DO NOTHING;
