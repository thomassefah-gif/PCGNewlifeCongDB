-- Group leaders: one leader account per group (any group type), each seeing only their group's contacts.

UPDATE public.profiles SET role = 'viewer' WHERE role NOT IN ('admin', 'user', 'viewer', 'group_leader');

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_group TEXT;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'user', 'viewer', 'group_leader'));

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.role::text FROM public.profiles AS p
  WHERE p.id = auth.uid() AND p.is_active IS TRUE
    AND p.role IN ('admin', 'user', 'viewer', 'group_leader')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_group()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.assigned_group FROM public.profiles AS p
  WHERE p.id = auth.uid() AND p.is_active IS TRUE AND p.role = 'group_leader'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_group() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_group() TO authenticated;

CREATE OR REPLACE FUNCTION public.leader_can_see_member(p_member_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_groups mg
    JOIN public.groups g ON g.id = mg.group_id
    WHERE mg.member_id = p_member_id
      AND lower(btrim(g.name)) = lower(btrim(public.current_group()))
  )
$$;
REVOKE ALL ON FUNCTION public.leader_can_see_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leader_can_see_member(UUID) TO authenticated;

-- Standard roles keep full read access (policies already exist); leaders get scoped read access.
DROP POLICY IF EXISTS members_select_leader ON public.members;
CREATE POLICY members_select_leader ON public.members
  FOR SELECT TO authenticated
  USING (public.current_role() = 'group_leader' AND public.leader_can_see_member(id));

DROP POLICY IF EXISTS member_groups_select_leader ON public.member_groups;
CREATE POLICY member_groups_select_leader ON public.member_groups
  FOR SELECT TO authenticated
  USING (public.current_role() = 'group_leader' AND public.leader_can_see_member(member_id));

DROP POLICY IF EXISTS groups_select_leader ON public.groups;
CREATE POLICY groups_select_leader ON public.groups
  FOR SELECT TO authenticated
  USING (public.current_role() = 'group_leader');

CREATE OR REPLACE FUNCTION public.admin_create_group_leader(
  p_email TEXT, p_password TEXT, p_full_name TEXT, p_assigned_group TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  normalized_email TEXT := lower(btrim(p_email));
  normalized_name TEXT := btrim(p_full_name);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles c WHERE c.id = auth.uid() AND c.role = 'admin' AND c.is_active IS TRUE
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Administrator access is required.');
  END IF;

  IF normalized_email = ''
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR normalized_name = ''
    OR p_password IS NULL OR length(p_password) < 8
    OR NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.name = p_assigned_group AND g.is_active IS NOT FALSE)
  THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Enter a valid name, email, password (8+ characters), and an existing group.');
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    normalized_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', normalized_name), now(), now(), FALSE, FALSE
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
  VALUES (
    new_user_id, new_user_id,
    jsonb_build_object('sub', new_user_id::TEXT, 'email', normalized_email, 'email_verified', TRUE),
    'email', normalized_email, now(), now()
  );

  INSERT INTO public.profiles (id, email, full_name, role, assigned_group, is_active)
  VALUES (new_user_id, normalized_email, normalized_name, 'group_leader', p_assigned_group, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role,
      assigned_group = EXCLUDED.assigned_group, is_active = TRUE;

  RETURN jsonb_build_object('success', TRUE, 'user_id', new_user_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'An account with this email already exists.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_leader_password(p_user_id UUID, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles c WHERE c.id = auth.uid() AND c.role = 'admin' AND c.is_active IS TRUE
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Administrator access is required.');
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Password must be at least 8 characters.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'group_leader') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Group leader not found.');
  END IF;
  UPDATE auth.users SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  WHERE id = p_user_id;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_leader_active(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles c WHERE c.id = auth.uid() AND c.role = 'admin' AND c.is_active IS TRUE
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Administrator access is required.');
  END IF;
  UPDATE public.profiles SET is_active = NOT is_active WHERE id = p_user_id AND role = 'group_leader';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Group leader not found.');
  END IF;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_leader(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles c WHERE c.id = auth.uid() AND c.role = 'admin' AND c.is_active IS TRUE
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Administrator access is required.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'group_leader') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Group leader not found.');
  END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_group_leader(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_leader_password(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_toggle_leader_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_leader(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_group_leader(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_leader_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_leader_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_leader(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
