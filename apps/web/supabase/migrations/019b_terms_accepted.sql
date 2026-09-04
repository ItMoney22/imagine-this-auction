-- 019b: record when a user accepted the Terms of Service and Privacy Policy.
--
-- The signup form (components/auth/auth-form.tsx) requires the bidder to tick
-- "I agree to the Terms of Service and Privacy Policy" and passes the moment
-- of acceptance through Supabase signup metadata as
-- raw_user_meta_data->>'terms_accepted_at'. The public.users profile row is
-- created later by app/auth/callback/route.ts once the email is confirmed, so
-- a BEFORE INSERT trigger copies the timestamp from auth.users onto the new
-- profile row. Nothing else has to change for the column to be populated.
--
-- Idempotent: safe to re-run. Run after 019.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.terms_accepted_at IS
  'When the user accepted the Terms of Service and Privacy Policy at signup. NULL for accounts created before the checkbox existed.';

CREATE OR REPLACE FUNCTION public.users_apply_terms_accepted_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw_value TEXT;
BEGIN
  IF NEW.terms_accepted_at IS NULL THEN
    SELECT u.raw_user_meta_data ->> 'terms_accepted_at'
      INTO raw_value
      FROM auth.users u
     WHERE u.id = NEW.id;

    IF raw_value IS NOT NULL THEN
      BEGIN
        NEW.terms_accepted_at := raw_value::TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN
        -- Malformed metadata must never block profile creation.
        NEW.terms_accepted_at := NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_apply_terms_accepted_from_auth ON public.users;
CREATE TRIGGER users_apply_terms_accepted_from_auth
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_apply_terms_accepted_from_auth();
