-- Fix "Database error querying schema" on login for SQL-created users:
-- GoTrue cannot read NULL token columns, so normalise them to empty strings.

UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL OR email_change_token_new IS NULL
   OR email_change IS NULL OR email_change_token_current IS NULL OR phone_change IS NULL
   OR phone_change_token IS NULL OR reauthentication_token IS NULL;

-- Make future leaders created by admin_create_group_leader login-safe.
CREATE OR REPLACE FUNCTION public.auth_users_fill_empty_tokens()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.confirmation_token := COALESCE(NEW.confirmation_token, '');
  NEW.recovery_token := COALESCE(NEW.recovery_token, '');
  NEW.email_change_token_new := COALESCE(NEW.email_change_token_new, '');
  NEW.email_change := COALESCE(NEW.email_change, '');
  NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
  NEW.phone_change := COALESCE(NEW.phone_change, '');
  NEW.phone_change_token := COALESCE(NEW.phone_change_token, '');
  NEW.reauthentication_token := COALESCE(NEW.reauthentication_token, '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_fill_empty_tokens ON auth.users;
CREATE TRIGGER auth_users_fill_empty_tokens
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auth_users_fill_empty_tokens();
