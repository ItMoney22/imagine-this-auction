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
-- The metadata key is only ever written when the checkbox was ticked, so its
-- presence proves acceptance even if the value itself is unreadable. In that
-- case the trigger falls back to auth.users.created_at (the moment the signup
-- form was submitted) rather than leaving the column NULL, and it clamps the
-- result to now() so a fast client clock cannot record a future acceptance.
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
  auth_created_at TIMESTAMPTZ;
  accepted_at TIMESTAMPTZ;
BEGIN
  IF NEW.terms_accepted_at IS NULL THEN
    SELECT u.raw_user_meta_data ->> 'terms_accepted_at', u.created_at
      INTO raw_value, auth_created_at
      FROM auth.users u
     WHERE u.id = NEW.id;

    IF raw_value IS NOT NULL THEN
      BEGIN
        accepted_at := raw_value::TIMESTAMPTZ;
      EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
          -- Malformed metadata must never block profile creation. The key is
          -- present, so the terms were accepted: use the signup moment instead.
          accepted_at := auth_created_at;
      END;

      -- Acceptance cannot postdate the insert; LEAST also ignores a NULL
      -- fallback, so the column is still populated in that edge case.
      NEW.terms_accepted_at := LEAST(accepted_at, now());
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
