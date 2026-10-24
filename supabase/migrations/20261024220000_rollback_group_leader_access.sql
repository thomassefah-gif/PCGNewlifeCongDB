UPDATE public.profiles
SET role = 'viewer',
    is_active = FALSE,
    assigned_group = NULL
WHERE role = 'group_leader';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'user', 'viewer'));

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.is_active IS TRUE
    AND p.role IN ('admin', 'user', 'viewer')
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_select_scoped ON public.members;
DROP POLICY IF EXISTS members_select_standard_roles ON public.members;
CREATE POLICY members_select_standard_roles ON public.members
  FOR SELECT TO authenticated
  USING (public.current_role() IN ('admin', 'user', 'viewer'));

DROP POLICY IF EXISTS members_insert_staff ON public.members;
CREATE POLICY members_insert_staff ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS members_update_staff ON public.members;
CREATE POLICY members_update_staff ON public.members
  FOR UPDATE TO authenticated
  USING (public.current_role() IN ('admin', 'user'))
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS members_delete_admin ON public.members;
CREATE POLICY members_delete_admin ON public.members
  FOR DELETE TO authenticated
  USING (public.current_role() = 'admin');

DROP POLICY IF EXISTS members_anon_sync ON public.members;
CREATE POLICY members_anon_sync ON public.members
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS member_groups_select_scoped ON public.member_groups;
DROP POLICY IF EXISTS member_groups_select_standard_roles ON public.member_groups;
CREATE POLICY member_groups_select_standard_roles ON public.member_groups
  FOR SELECT TO authenticated
  USING (public.current_role() IN ('admin', 'user', 'viewer'));

DROP POLICY IF EXISTS member_groups_insert_staff ON public.member_groups;
CREATE POLICY member_groups_insert_staff ON public.member_groups
  FOR INSERT TO authenticated
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS member_groups_update_staff ON public.member_groups;
CREATE POLICY member_groups_update_staff ON public.member_groups
  FOR UPDATE TO authenticated
  USING (public.current_role() IN ('admin', 'user'))
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS member_groups_delete_admin ON public.member_groups;
CREATE POLICY member_groups_delete_admin ON public.member_groups
  FOR DELETE TO authenticated
  USING (public.current_role() = 'admin');

DROP POLICY IF EXISTS member_groups_anon_sync ON public.member_groups;
CREATE POLICY member_groups_anon_sync ON public.member_groups
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS groups_select_by_role ON public.groups;
DROP POLICY IF EXISTS groups_select_standard_roles ON public.groups;
CREATE POLICY groups_select_standard_roles ON public.groups
  FOR SELECT TO authenticated
  USING (public.current_role() IN ('admin', 'user', 'viewer'));

DROP POLICY IF EXISTS groups_manage_staff ON public.groups;
CREATE POLICY groups_manage_staff ON public.groups
  FOR ALL TO authenticated
  USING (public.current_role() IN ('admin', 'user'))
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS groups_anon_sync ON public.groups;
CREATE POLICY groups_anon_sync ON public.groups
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_role() = 'admin');

DROP POLICY IF EXISTS profiles_admin_manage ON public.profiles;
CREATE POLICY profiles_admin_manage ON public.profiles
  FOR ALL TO authenticated
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

DROP POLICY IF EXISTS contributions_select_non_leaders ON public.contributions;
DROP POLICY IF EXISTS contributions_select_standard_roles ON public.contributions;
CREATE POLICY contributions_select_standard_roles ON public.contributions
  FOR SELECT TO authenticated
  USING (public.current_role() IN ('admin', 'user', 'viewer'));

DROP POLICY IF EXISTS contributions_insert_staff ON public.contributions;
CREATE POLICY contributions_insert_staff ON public.contributions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS contributions_update_staff ON public.contributions;
CREATE POLICY contributions_update_staff ON public.contributions
  FOR UPDATE TO authenticated
  USING (public.current_role() IN ('admin', 'user'))
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS contributions_delete_admin ON public.contributions;
CREATE POLICY contributions_delete_admin ON public.contributions
  FOR DELETE TO authenticated
  USING (public.current_role() = 'admin');

DROP POLICY IF EXISTS announcements_select_signed_in ON public.announcements;
CREATE POLICY announcements_select_signed_in ON public.announcements
  FOR SELECT TO authenticated
  USING (public.current_role() IN ('admin', 'user', 'viewer'));

DROP POLICY IF EXISTS announcements_insert_staff ON public.announcements;
CREATE POLICY announcements_insert_staff ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS announcements_update_staff ON public.announcements;
CREATE POLICY announcements_update_staff ON public.announcements
  FOR UPDATE TO authenticated
  USING (public.current_role() IN ('admin', 'user'))
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS announcements_delete_admin ON public.announcements;
CREATE POLICY announcements_delete_admin ON public.announcements
  FOR DELETE TO authenticated
  USING (public.current_role() = 'admin');

DO $$
BEGIN
  IF to_regclass('public.attendance_sessions') IS NOT NULL THEN
    ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS attendance_sessions_select_scoped ON public.attendance_sessions;
    DROP POLICY IF EXISTS attendance_sessions_select_standard_roles ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_select_standard_roles ON public.attendance_sessions
      FOR SELECT TO authenticated
      USING (public.current_role() IN ('admin', 'user', 'viewer'));

    DROP POLICY IF EXISTS attendance_sessions_insert_scoped ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_insert_scoped ON public.attendance_sessions
      FOR INSERT TO authenticated
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS attendance_sessions_update_scoped ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_update_scoped ON public.attendance_sessions
      FOR UPDATE TO authenticated
      USING (public.current_role() IN ('admin', 'user'))
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS attendance_sessions_delete_admin ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_delete_admin ON public.attendance_sessions
      FOR DELETE TO authenticated
      USING (public.current_role() = 'admin');
  END IF;

  IF to_regclass('public.attendance_records') IS NOT NULL THEN
    ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS attendance_records_select_scoped ON public.attendance_records;
    DROP POLICY IF EXISTS attendance_records_select_standard_roles ON public.attendance_records;
    CREATE POLICY attendance_records_select_standard_roles ON public.attendance_records
      FOR SELECT TO authenticated
      USING (public.current_role() IN ('admin', 'user', 'viewer'));

    DROP POLICY IF EXISTS attendance_records_insert_scoped ON public.attendance_records;
    DROP POLICY IF EXISTS attendance_records_insert_standard_roles ON public.attendance_records;
    CREATE POLICY attendance_records_insert_standard_roles ON public.attendance_records
      FOR INSERT TO authenticated
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS attendance_records_delete_staff ON public.attendance_records;
    CREATE POLICY attendance_records_delete_staff ON public.attendance_records
      FOR DELETE TO authenticated
      USING (public.current_role() IN ('admin', 'user'));
  END IF;

  IF to_regclass('public.attendance') IS NOT NULL
    AND (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.attendance')) IN ('r', 'p')
  THEN
    ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS attendance_select_scoped ON public.attendance;
    DROP POLICY IF EXISTS attendance_select_standard_roles ON public.attendance;
    CREATE POLICY attendance_select_standard_roles ON public.attendance
      FOR SELECT TO authenticated
      USING (public.current_role() IN ('admin', 'user', 'viewer'));

    DROP POLICY IF EXISTS attendance_insert_scoped ON public.attendance;
    DROP POLICY IF EXISTS attendance_insert_standard_roles ON public.attendance;
    CREATE POLICY attendance_insert_standard_roles ON public.attendance
      FOR INSERT TO authenticated
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS attendance_update_staff ON public.attendance;
    CREATE POLICY attendance_update_staff ON public.attendance
      FOR UPDATE TO authenticated
      USING (public.current_role() IN ('admin', 'user'))
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS attendance_delete_admin ON public.attendance;
    CREATE POLICY attendance_delete_admin ON public.attendance
      FOR DELETE TO authenticated
      USING (public.current_role() = 'admin');
  END IF;

  IF to_regclass('public.special_events') IS NOT NULL THEN
    ALTER TABLE public.special_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS special_events_select_signed_in ON public.special_events;
    CREATE POLICY special_events_select_signed_in ON public.special_events
      FOR SELECT TO authenticated
      USING (public.current_role() IN ('admin', 'user', 'viewer'));

    DROP POLICY IF EXISTS special_events_insert_staff ON public.special_events;
    CREATE POLICY special_events_insert_staff ON public.special_events
      FOR INSERT TO authenticated
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS special_events_update_staff ON public.special_events;
    CREATE POLICY special_events_update_staff ON public.special_events
      FOR UPDATE TO authenticated
      USING (public.current_role() IN ('admin', 'user'))
      WITH CHECK (public.current_role() IN ('admin', 'user'));

    DROP POLICY IF EXISTS special_events_delete_admin ON public.special_events;
    CREATE POLICY special_events_delete_admin ON public.special_events
      FOR DELETE TO authenticated
      USING (public.current_role() = 'admin');
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_create_group_leader(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_reset_group_leader_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public.current_group();
DROP FUNCTION IF EXISTS public.can_see_member(UUID);

DO $$
DECLARE
  readable_columns TEXT;
  writable_columns TEXT;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
  INTO readable_columns
  FROM pg_attribute
  WHERE attrelid = 'public.members'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname <> 'admin_notes';

  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
  INTO writable_columns
  FROM pg_attribute
  WHERE attrelid = 'public.members'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attgenerated = ''
    AND attidentity = ''
    AND attname <> 'admin_notes';

  EXECUTE format('GRANT SELECT (%s) ON TABLE public.members TO authenticated, anon', readable_columns);
  EXECUTE format('GRANT INSERT (%s) ON TABLE public.members TO authenticated, anon', writable_columns);
  EXECUTE format('GRANT UPDATE (%s) ON TABLE public.members TO authenticated, anon', writable_columns);
END;
$$;

NOTIFY pgrst, 'reload schema';
