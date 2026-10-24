ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_group TEXT;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_create_group_leader(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_assigned_group TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  normalized_email TEXT := lower(btrim(p_email));
  normalized_name TEXT := btrim(p_full_name);
  allowed_groups CONSTANT TEXT[] := ARRAY[
    'Children Service',
    'Junior Youth (JY)',
    'Young People''s Guild (YPG)',
    'Young Adults Fellowship (YAF)',
    'Women''s Fellowship',
    'Men''s Fellowship'
  ];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS caller
    WHERE caller.id = auth.uid()
      AND caller.role = 'admin'
      AND caller.is_active IS TRUE
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Administrator access is required.');
  END IF;

  IF normalized_email = ''
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR normalized_name = ''
    OR p_password IS NULL
    OR length(p_password) < 8
    OR NOT (p_assigned_group = ANY (allowed_groups))
  THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Enter a valid name, email, password, and assigned group.');
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_sso_user,
    is_anonymous
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    normalized_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', normalized_name),
    now(),
    now(),
    FALSE,
    FALSE
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  )
  VALUES (
    new_user_id,
    new_user_id,
    jsonb_build_object('sub', new_user_id::TEXT, 'email', normalized_email, 'email_verified', TRUE),
    'email',
    normalized_email,
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    assigned_group,
    is_active
  )
  VALUES (
    new_user_id,
    normalized_email,
    normalized_name,
    'group_leader',
    p_assigned_group,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      assigned_group = EXCLUDED.assigned_group,
      is_active = TRUE;

  RETURN jsonb_build_object('success', TRUE, 'user_id', new_user_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'An account with this email already exists.');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_group_leader(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_group_leader(TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
