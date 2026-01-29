-- Admin Support Migration
-- Creates missing tables, views, and functions for admin endpoints

-- ============================================
-- TABLES
-- ============================================

-- Announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT DEFAULT 'all',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  admin_id UUID REFERENCES public.users(id)
);

-- System announcements (different from above for compatibility)
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'urgent')) DEFAULT 'info',
  target_roles TEXT[] DEFAULT ARRAY['bidder', 'auctioneer', 'admin'],
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- KYC documents table
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  doc_type TEXT NOT NULL,
  url TEXT,
  status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id)
);

-- User documents (different from above for compatibility)
CREATE TABLE IF NOT EXISTS public.user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  document_type TEXT NOT NULL,
  filename TEXT,
  file_url TEXT,
  file_size BIGINT,
  mime_type TEXT,
  verification_status TEXT CHECK (verification_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  verification_notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id)
);

-- Compliance flags table
CREATE TABLE IF NOT EXISTS public.compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  reason TEXT NOT NULL,
  severity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id)
);

-- User compliance flags (different from above for compatibility)
CREATE TABLE IF NOT EXISTS public.user_compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  flag_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  description TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  flagged_by UUID REFERENCES public.users(id),
  resolved_by UUID REFERENCES public.users(id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_announcements_active ON public.system_announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_system_announcements_created ON public.system_announcements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_docs_user ON public.kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_docs_status ON public.kyc_documents(status);

CREATE INDEX IF NOT EXISTS idx_user_docs_user ON public.user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_docs_status ON public.user_documents(verification_status);

CREATE INDEX IF NOT EXISTS idx_compliance_flags_user ON public.compliance_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_flags_created ON public.compliance_flags(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_compliance_flags_user ON public.user_compliance_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_compliance_flags_resolved ON public.user_compliance_flags(is_resolved);
CREATE INDEX IF NOT EXISTS idx_user_compliance_flags_severity ON public.user_compliance_flags(severity);

-- ============================================
-- VIEWS
-- ============================================

-- Financial aggregates view
CREATE OR REPLACE VIEW public.financial_aggregates AS
SELECT
  date_trunc('day', COALESCE(il.created_at, wl.created_at)) as day,
  COALESCE(sum(il.total_amount), 0) as gross_sales,
  COALESCE(sum(il.buyer_premium_amount), 0) as buyers_premium,
  COALESCE(sum(il.platform_commission_amount), 0) as platform_commission,
  COALESCE(sum(CASE WHEN il.status = 'escrow_hold' THEN il.total_amount ELSE 0 END), 0) as escrow_balance,
  count(il.id) as invoice_count,
  count(CASE WHEN il.is_paid THEN 1 END) as paid_invoices
FROM invoices il
FULL OUTER JOIN wallet_ledger wl ON date_trunc('day', il.created_at) = date_trunc('day', wl.created_at)
WHERE il.created_at >= NOW() - INTERVAL '90 days'
   OR wl.created_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Suspicious users view
CREATE OR REPLACE VIEW public.suspicious_users_view AS
SELECT
  u.id as user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.role,
  COALESCE(bid_stats.bid_count_last7d, 0) as bid_count_last7d,
  COALESCE(bid_stats.unique_auctions, 0) as unique_auctions_bid,
  COALESCE(wl_stats.total_negative_balance_events, 0) as credit_issues,
  COALESCE(cf_stats.flags, 0) as compliance_flags,
  COALESCE(inv_stats.failed_payments, 0) as failed_payments,
  -- Calculate risk score
  LEAST(100, (
    COALESCE(bid_stats.bid_count_last7d, 0) * 0.5 +
    COALESCE(wl_stats.total_negative_balance_events, 0) * 5 +
    COALESCE(cf_stats.flags, 0) * 10 +
    COALESCE(inv_stats.failed_payments, 0) * 8
  )) as risk_score,
  u.created_at as account_created
FROM users u
LEFT JOIN (
  SELECT
    bidder_id,
    count(*) as bid_count_last7d,
    count(DISTINCT lot_id) as unique_auctions
  FROM bids
  WHERE created_at >= now() - interval '7 days'
  GROUP BY bidder_id
) bid_stats ON bid_stats.bidder_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    count(*) as total_negative_balance_events
  FROM wallet_ledger
  WHERE amount < 0 AND balance_after < 0
  GROUP BY user_id
) wl_stats ON wl_stats.user_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    count(*) as flags
  FROM compliance_flags
  WHERE resolved_at IS NULL
  GROUP BY user_id
) cf_stats ON cf_stats.user_id = u.id
LEFT JOIN (
  SELECT
    buyer_id,
    count(*) as failed_payments
  FROM invoices
  WHERE is_paid = false AND created_at < now() - interval '7 days'
  GROUP BY buyer_id
) inv_stats ON inv_stats.buyer_id = u.id
WHERE u.role IN ('bidder', 'auctioneer');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Financial summary function
CREATE OR REPLACE FUNCTION public.get_financial_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  total_revenue DECIMAL(12,2);
  total_escrow DECIMAL(12,2);
  pending_payouts DECIMAL(12,2);
  active_auctions INTEGER;
  total_users INTEGER;
BEGIN
  -- Calculate total revenue (from wallet purchases)
  SELECT COALESCE(SUM(amount), 0) / 100.0 INTO total_revenue
  FROM wallet_ledger
  WHERE transaction_type = 'purchase';

  -- Calculate total escrow held
  SELECT COALESCE(SUM(CASE WHEN balance_after > 0 THEN balance_after ELSE 0 END), 0) / 100.0 INTO total_escrow
  FROM wallet_ledger wl1
  WHERE wl1.id = (
    SELECT wl2.id
    FROM wallet_ledger wl2
    WHERE wl2.user_id = wl1.user_id
    ORDER BY wl2.created_at DESC
    LIMIT 1
  );

  -- Calculate pending payouts
  SELECT COALESCE(SUM(amount), 0) / 100.0 INTO pending_payouts
  FROM payouts_due
  WHERE is_paid = false;

  -- Count active auctions
  SELECT COUNT(*) INTO active_auctions
  FROM auctions
  WHERE status = 'live';

  -- Count total users
  SELECT COUNT(*) INTO total_users
  FROM users;

  -- Build result
  result := json_build_object(
    'total_revenue', total_revenue,
    'total_escrow', total_escrow,
    'pending_payouts', pending_payouts,
    'active_auctions', active_auctions,
    'total_users', total_users,
    'platform_commission', total_revenue * 0.012,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

-- Suspicious users detection function
CREATE OR REPLACE FUNCTION public.detect_suspicious_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  risk_score NUMERIC,
  flags TEXT[],
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sv.user_id,
    sv.email,
    sv.first_name,
    sv.last_name,
    sv.risk_score,
    ARRAY[
      CASE WHEN sv.bid_count_last7d > 50 THEN 'high_bidding_activity' END,
      CASE WHEN sv.credit_issues > 3 THEN 'frequent_credit_issues' END,
      CASE WHEN sv.compliance_flags > 0 THEN 'has_compliance_flags' END,
      CASE WHEN sv.failed_payments > 2 THEN 'payment_failures' END
    ]::TEXT[] as flags,
    (
      SELECT MAX(created_at)
      FROM (
        SELECT created_at FROM bids WHERE bidder_id = sv.user_id
        UNION ALL
        SELECT created_at FROM wallet_ledger WHERE user_id = sv.user_id
      ) activities
    ) as last_activity
  FROM suspicious_users_view sv
  WHERE sv.risk_score > 15
  ORDER BY sv.risk_score DESC;
END;
$$;

-- Admin action logging function
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_before_values JSONB DEFAULT NULL,
  p_after_values JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO audit_log (
    id,
    admin_id,
    action,
    target_type,
    target_id,
    before_values,
    after_values,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_admin_id,
    p_action,
    p_target_type,
    p_target_id,
    p_before_values,
    p_after_values,
    now()
  ) RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_compliance_flags ENABLE ROW LEVEL SECURITY;

-- Announcements policies
CREATE POLICY "Users can view active announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- System announcements policies
CREATE POLICY "Users can view active system announcements" ON public.system_announcements
  FOR SELECT TO authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Admins can manage system announcements" ON public.system_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- KYC documents policies
CREATE POLICY "Users can view own kyc documents" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all kyc documents" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- User documents policies
CREATE POLICY "Users can view own documents" ON public.user_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all documents" ON public.user_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Compliance flags policies
CREATE POLICY "Admins can manage compliance flags" ON public.compliance_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage user compliance flags" ON public.user_compliance_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_announcements_updated_at
  BEFORE UPDATE ON public.system_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;