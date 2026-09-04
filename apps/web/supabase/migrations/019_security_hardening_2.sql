-- 019_security_hardening_2.sql
-- Closes the privilege-escalation holes confirmed on the LIVE database
-- (project qdiodkevkacgbfvplafm, pg_policies + column_privileges) in the
-- 2026-09-04 launch audit. Run AFTER 013-018. Idempotent: safe to re-run.
--
-- What was wrong:
--   1. The users UPDATE policy is just `id = auth.uid()` and the `authenticated`
--      role holds column UPDATE on users.role / users.is_approved, so any
--      logged-in user can PATCH themselves to admin through PostgREST.
--      Same shape on auctioneers.is_approved / approval_date.
--   2. The users INSERT policy is `auth.uid() IS NOT NULL` with no role check,
--      so a fresh sign-up whose profile row does not exist yet can insert one
--      with role = 'admin'.
--   3. app/api/admin/users/[id]/{role,status} call change_user_role /
--      change_user_status, which do not exist in the live DB.
--   4. log_admin_action (005) inserts columns audit_log does not have, so it
--      throws on every call.
--   5. The private auctioneer-licenses bucket has no storage.objects policies.
--
-- Every legitimate writer of the privileged columns goes through the
-- service-role client (app/api/auctioneer/apply, app/api/admin/auctioneers/
-- [id]/status, app/api/admin/drivers) or the admin-only RPCs below, none of
-- which are affected by the grants or the triggers. Ordinary profile edits
-- (first_name, phone, notification_prefs, auctioneers.ai_preferences, ...)
-- keep working: those columns are re-granted explicitly.

-- ============================================================
-- 0. Who is allowed to touch privileged columns?
-- ============================================================

-- Role claim of the JWT PostgREST attached to this request:
--   'service_role'  service-role key (server code)
--   'authenticated' user session
--   'anon'          anon key, no session
--   ''              no JWT at all: SQL editor, pg_cron, direct psql
-- Same GUCs auth.uid()/auth.role() read; inlined so this does not depend on
-- the deprecated auth.role() wrapper.
CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
$$;

-- TRUE for the service role, for sessions with no JWT (SQL editor, cron), and
-- for signed-in admins (same get_user_role() primitive the RLS policies use).
-- Always returns a non-null boolean so `IF NOT ...` guards are safe.
CREATE OR REPLACE FUNCTION public.is_admin_or_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.request_jwt_role() IN ('service_role', '')
      OR COALESCE(
           auth.uid() IS NOT NULL AND public.get_user_role() = 'admin'::user_role,
           false
         );
$$;

-- ============================================================
-- 1. Column-level UPDATE grants
-- ============================================================
-- A column-level REVOKE does not remove a table-level GRANT, and the live DB
-- has table-level UPDATE granted to authenticated/anon on both tables. So:
-- revoke the table-level privilege, then grant UPDATE back column by column
-- on everything that is NOT privileged. The column list is read from the live
-- catalog so a column added outside these migration files keeps working
-- (status quo for it: it was already updatable); the NOTICE shows exactly
-- what was granted.
--
-- users:       privileged = id, role, is_approved, created_at
--              expected grant = email, first_name, last_name, phone,
--                               notification_prefs (006),
--                               display_in_leaderboard (012), updated_at
-- auctioneers: privileged = id, user_id, is_approved, approval_date, created_at
--              expected grant = company_name, business_license, tax_id,
--                               address_line1, address_line2, city, state,
--                               zip_code, website, logo_url,
--                               ai_preferences (007), updated_at

REVOKE UPDATE ON public.users FROM authenticated, anon;
REVOKE UPDATE ON public.auctioneers FROM authenticated, anon;

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name NOT IN ('id', 'role', 'is_approved', 'created_at');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'public.users has no grantable columns?!';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.users TO authenticated', v_cols);
  RAISE NOTICE 'users: authenticated may UPDATE (%)', v_cols;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'auctioneers'
    AND column_name NOT IN ('id', 'user_id', 'is_approved', 'approval_date', 'created_at');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'public.auctioneers has no grantable columns?!';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.auctioneers TO authenticated', v_cols);
  RAISE NOTICE 'auctioneers: authenticated may UPDATE (%)', v_cols;
END $$;

-- ============================================================
-- 2. Triggers: belt and suspenders for the grants above
-- ============================================================
-- Generic BEFORE UPDATE guard. The protected column names are passed as
-- trigger arguments, so one function serves both tables. Raises
-- insufficient_privilege (42501) unless the caller is an admin or the
-- service role. SECURITY DEFINER so it works regardless of who fires it;
-- auth.uid() and the JWT GUCs are session settings and still describe the
-- real caller inside a definer function.
CREATE OR REPLACE FUNCTION public.protect_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_col TEXT;
  v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF public.is_admin_or_service_role() THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    IF v_new -> v_col IS DISTINCT FROM v_old -> v_col THEN
      v_changed := array_append(v_changed, v_col);
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = format(
        '%I.%I: only an admin can change %s',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, array_to_string(v_changed, ', ')
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_users_privileged_columns ON public.users;
CREATE TRIGGER protect_users_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_columns('role', 'is_approved');

DROP TRIGGER IF EXISTS protect_auctioneers_privileged_columns ON public.auctioneers;
CREATE TRIGGER protect_auctioneers_privileged_columns
  BEFORE UPDATE ON public.auctioneers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_columns('is_approved', 'approval_date');

-- Same class of hole on INSERT: app/auth/callback creates the profile row
-- from the user's own session (role 'bidder', is_approved true — bidders are
-- auto-approved). Nothing else inserts into users from a user session, so a
-- non-privileged insert must be the caller's own row and must be a bidder.
CREATE OR REPLACE FUNCTION public.protect_users_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_or_service_role() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'public.users: you can only create your own profile';
  END IF;

  IF NEW.role IS DISTINCT FROM 'bidder'::user_role THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'public.users: self-created profiles must have role bidder';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_users_insert ON public.users;
CREATE TRIGGER protect_users_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_users_insert();

-- ============================================================
-- 3. log_admin_action: write the columns audit_log actually has
-- ============================================================
-- audit_log (001): user_id, action, table_name, record_id, old_values,
-- new_values, ip_address, user_agent, created_at.
-- Callers: app/api/admin/announcements/[id] (session client, 6 named params),
-- app/api/admin/auctioneers/[id]/status (service role, adds p_notes), and the
-- RPCs below. The actor recorded is the real JWT subject when there is one,
-- so an admin cannot attribute an action to someone else; the service role
-- (no subject) records the id the server passes in.
DROP FUNCTION IF EXISTS public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT, INET, TEXT);

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_before_values JSONB DEFAULT NULL,
  p_after_values JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_after JSONB := p_after_values;
BEGIN
  IF NOT public.is_admin_or_service_role() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Admin access required';
  END IF;

  IF p_notes IS NOT NULL AND btrim(p_notes) <> '' THEN
    v_after := COALESCE(v_after, '{}'::jsonb) || jsonb_build_object('notes', p_notes);
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    COALESCE(auth.uid(), p_admin_id),
    p_action,
    COALESCE(NULLIF(btrim(p_target_type), ''), 'system'),
    p_target_id,
    p_before_values,
    v_after
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) TO authenticated, service_role;

-- ============================================================
-- 4. Admin RPCs the routes already call
-- ============================================================
-- Parameter names and return shapes match app/api/admin/users/[id]/role and
-- .../status exactly. Bodies adapted from 20240101000005_admin_audit_system
-- .sql.disabled with the audit call fixed and an admin guard added: the
-- routes call these through the user's session, so PostgREST exposes them to
-- every authenticated user and the function itself must refuse non-admins.

CREATE OR REPLACE FUNCTION public.change_user_role(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_new_role user_role,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_old_role user_role;
  v_email TEXT;
BEGIN
  IF NOT public.is_admin_or_service_role() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Admin access required';
  END IF;

  v_actor := COALESCE(auth.uid(), p_admin_id);

  IF v_actor = p_target_user_id AND p_new_role <> 'admin'::user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove admin role from yourself');
  END IF;

  SELECT role, email INTO v_old_role, v_email
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_old_role = p_new_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already has this role');
  END IF;

  UPDATE public.users
  SET role = p_new_role, updated_at = timezone('utc'::text, now())
  WHERE id = p_target_user_id;

  PERFORM public.log_admin_action(
    v_actor,
    'role_change',
    'users',
    p_target_user_id,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_new_role),
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_role', v_old_role,
    'new_role', p_new_role,
    'user_email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_user_role(UUID, UUID, user_role, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_user_role(UUID, UUID, user_role, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_user_status(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_is_approved BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_old_status BOOLEAN;
  v_email TEXT;
  v_action TEXT;
BEGIN
  IF NOT public.is_admin_or_service_role() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Admin access required';
  END IF;

  v_actor := COALESCE(auth.uid(), p_admin_id);

  IF v_actor = p_target_user_id AND NOT p_is_approved THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot suspend your own account');
  END IF;

  SELECT is_approved, email INTO v_old_status, v_email
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_old_status = p_is_approved THEN
    RETURN jsonb_build_object('success', false, 'error', 'User status unchanged');
  END IF;

  UPDATE public.users
  SET is_approved = p_is_approved, updated_at = timezone('utc'::text, now())
  WHERE id = p_target_user_id;

  v_action := CASE WHEN p_is_approved THEN 'user_unsuspended' ELSE 'user_suspended' END;

  PERFORM public.log_admin_action(
    v_actor,
    v_action,
    'users',
    p_target_user_id,
    jsonb_build_object('is_approved', v_old_status),
    jsonb_build_object('is_approved', p_is_approved),
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_old_status,
    'new_status', p_is_approved,
    'user_email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_user_status(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_user_status(UUID, UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- ============================================================
-- 5. Storage: auctioneer-licenses bucket policies
-- ============================================================
-- Bucket created in 009 (private, 10 MB, pdf/jpeg/png/webp). Uploads go
-- through the service role (app/api/auctioneer/apply) under
-- `<user_id>/<file>`, and admins read through a signed URL from the service
-- role too — so today no policy is strictly required for the app to work.
-- These make the intent explicit and cover any direct client access:
-- owner may read their own folder, admins may do anything.
--
-- storage.objects is owned by supabase_storage_admin, so policy creation can
-- be refused depending on the role running the migration (same wrapper as
-- 016). A refusal is logged rather than failing the rest of this migration.
INSERT INTO storage.buckets (id, name, public)
VALUES ('auctioneer-licenses', 'auctioneer-licenses', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Auctioneers read own license files" ON storage.objects;
  CREATE POLICY "Auctioneers read own license files" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'auctioneer-licenses'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "Admins manage license files" ON storage.objects;
  CREATE POLICY "Admins manage license files" ON storage.objects
    FOR ALL TO authenticated
    USING (
      bucket_id = 'auctioneer-licenses'
      AND public.get_user_role() = 'admin'::user_role
    )
    WITH CHECK (
      bucket_id = 'auctioneer-licenses'
      AND public.get_user_role() = 'admin'::user_role
    );
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Skipped storage.objects policies for auctioneer-licenses (insufficient privilege). Create them from Storage > Policies in the dashboard: owner SELECT where (storage.foldername(name))[1] = auth.uid()::text; admin ALL where get_user_role() = ''admin''.';
END $$;

-- ============================================================
-- 6. Tell PostgREST about the new/changed functions
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Verification (the SQL editor shows this result set)
-- ============================================================
-- Every row should read ok = true. A false on a "cannot UPDATE" row means
-- the table-level grant came from a grantor other than the role running this
-- file (REVOKE only removes your own grants) — the triggers in section 2
-- still block the change, but investigate. A false on a storage row means
-- the policies were skipped for lack of privilege; add them from the
-- dashboard (see the NOTICE text in section 5).
SELECT check_name, ok
FROM (VALUES
  (10, 'authenticated cannot UPDATE users.role',
       NOT has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')),
  (11, 'authenticated cannot UPDATE users.is_approved',
       NOT has_column_privilege('authenticated', 'public.users', 'is_approved', 'UPDATE')),
  (12, 'anon cannot UPDATE users at all',
       NOT has_table_privilege('anon', 'public.users', 'UPDATE')),
  (13, 'authenticated cannot UPDATE auctioneers.is_approved',
       NOT has_column_privilege('authenticated', 'public.auctioneers', 'is_approved', 'UPDATE')),
  (14, 'authenticated cannot UPDATE auctioneers.approval_date',
       NOT has_column_privilege('authenticated', 'public.auctioneers', 'approval_date', 'UPDATE')),
  (15, 'anon cannot UPDATE auctioneers at all',
       NOT has_table_privilege('anon', 'public.auctioneers', 'UPDATE')),
  (20, 'authenticated can still UPDATE users.first_name (profile edits work)',
       has_column_privilege('authenticated', 'public.users', 'first_name', 'UPDATE')),
  (21, 'authenticated can still UPDATE auctioneers.company_name (profile edits work)',
       has_column_privilege('authenticated', 'public.auctioneers', 'company_name', 'UPDATE')),
  (30, 'trigger protect_users_privileged_columns exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_users_privileged_columns' AND NOT tgisinternal)),
  (31, 'trigger protect_auctioneers_privileged_columns exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_auctioneers_privileged_columns' AND NOT tgisinternal)),
  (32, 'trigger protect_users_insert exists',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_users_insert' AND NOT tgisinternal)),
  (40, 'function change_user_role(uuid, uuid, user_role, text) exists',
       to_regprocedure('public.change_user_role(uuid, uuid, user_role, text)') IS NOT NULL),
  (41, 'function change_user_status(uuid, uuid, boolean, text) exists',
       to_regprocedure('public.change_user_status(uuid, uuid, boolean, text)') IS NOT NULL),
  (42, 'function log_admin_action(7 args) exists',
       to_regprocedure('public.log_admin_action(uuid, text, text, uuid, jsonb, jsonb, text)') IS NOT NULL),
  (43, 'old log_admin_action(6 args) removed',
       to_regprocedure('public.log_admin_action(uuid, text, text, uuid, jsonb, jsonb)') IS NULL),
  (44, 'anon cannot EXECUTE change_user_role',
       NOT has_function_privilege('anon', 'public.change_user_role(uuid, uuid, user_role, text)', 'EXECUTE')),
  (45, 'anon cannot EXECUTE change_user_status',
       NOT has_function_privilege('anon', 'public.change_user_status(uuid, uuid, boolean, text)', 'EXECUTE')),
  (46, 'anon cannot EXECUTE log_admin_action',
       NOT has_function_privilege('anon', 'public.log_admin_action(uuid, text, text, uuid, jsonb, jsonb, text)', 'EXECUTE')),
  (50, 'storage policy "Auctioneers read own license files" exists',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Auctioneers read own license files')),
  (51, 'storage policy "Admins manage license files" exists',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins manage license files'))
) AS checks (ord, check_name, ok)
ORDER BY ord;
