-- Let admins create any app account (admin, user, viewer, group_leader) from inside the app.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT, p_password TEXT, p_full_name TEXT, p_role TEXT, p_assigned_group TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  normalized_email TEXT := lower(btrim(p_email));
  normalized_name TEXT := btrim(p_full_name);
  group_name TEXT := NULLIF(btrim(COALESCE(p_assigned_group, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles c WHERE c.id = auth.uid() AND c.role = 'admin' AND c.is_active IS TRUE
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Administrator access is required.');
  END IF;

  IF normalized_email = '' OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR normalized_name = '' OR p_password IS NULL OR length(p_password) < 8
    OR p_role NOT IN ('admin', 'user', 'viewer', 'group_leader')
  THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Enter a valid name, email, role and a password of 8+ characters.');
  END IF;

  IF p_role = 'group_leader' AND group_name IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Choose a group for a group leader.');
  END IF;
  IF group_name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.name = group_name) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'The selected group does not exist.');
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    normalized_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', normalized_name), now(), now(), FALSE, FALSE,
    '', '', '', '', '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
  VALUES (
    new_user_id, new_user_id,
    jsonb_build_object('sub', new_user_id::TEXT, 'email', normalized_email, 'email_verified', TRUE),
    'email', normalized_email, now(), now()
  );

  INSERT INTO public.profiles (id, email, full_name, role, assigned_group, is_active)
  VALUES (new_user_id, normalized_email, normalized_name, p_role, group_name, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role,
      assigned_group = EXCLUDED.assigned_group, is_active = TRUE;

  RETURN jsonb_build_object('success', TRUE, 'user_id', new_user_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'An account with this email already exists.');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
