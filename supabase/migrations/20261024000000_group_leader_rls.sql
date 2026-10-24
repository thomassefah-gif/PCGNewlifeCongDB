ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_group TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.profiles SET is_active = TRUE WHERE is_active IS NULL;
ALTER TABLE public.profiles ALTER COLUMN is_active SET DEFAULT TRUE;
ALTER TABLE public.profiles ALTER COLUMN is_active SET NOT NULL;

DO $$
DECLARE
  constraint_row RECORD;
  policy_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'user', 'viewer', 'group_leader'));

  FOR policy_row IN
    SELECT schemaname, tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'members', 'member_groups', 'groups', 'profiles',
        'attendance', 'attendance_sessions', 'attendance_records',
        'contributions', 'announcements', 'special_events'
      )
  LOOP
    IF NOT (
      policy_row.tablename IN ('members', 'member_groups', 'groups')
      AND policy_row.cmd = 'ALL'
      AND cardinality(policy_row.roles) = 1
      AND policy_row.roles @> ARRAY['anon']::name[]
    ) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename
      );
    END IF;
  END LOOP;
END;
$$;

UPDATE public.profiles
SET assigned_group = CASE assigned_group
  WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
  WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
  WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
  WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
  ELSE assigned_group
END
WHERE assigned_group IN ('YPG', 'YAF', 'Womens Fellowship', 'Mens Fellowship');

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
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_group()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p.assigned_group
    WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
    WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
    WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
    WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
    ELSE NULLIF(btrim(p.assigned_group), '')
  END
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.is_active IS TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_see_member(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_name TEXT := public.current_role();
  group_name TEXT := public.current_group();
BEGIN
  IF role_name IN ('admin', 'user', 'viewer') THEN
    RETURN TRUE;
  END IF;

  IF role_name <> 'group_leader' OR group_name IS NULL OR btrim(group_name) = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.member_groups AS mg
    JOIN public.groups AS g ON g.id = mg.group_id
    WHERE mg.member_id = p_member_id
      AND g.group_type = 'generational'
      AND CASE g.name
        WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
        WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
        WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
        WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
        ELSE g.name
      END = group_name
  ) OR EXISTS (
    SELECT 1
    FROM public.members AS m
    WHERE m.id = p_member_id
      AND group_name IN (
        CASE m.primary_generational_group
          WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
          WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
          WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
          WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
          ELSE m.primary_generational_group
        END,
        CASE m.generational_group
          WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
          WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
          WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
          WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
          ELSE m.generational_group
        END,
        CASE m.family_group
          WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
          WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
          WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
          WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
          ELSE m.family_group
        END,
        CASE m.church_family_group
          WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
          WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
          WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
          WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
          ELSE m.church_family_group
        END
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_admin_notes(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notes TEXT;
BEGIN
  IF public.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  SELECT m.admin_notes INTO notes
  FROM public.members AS m
  WHERE m.id = p_member_id;
  RETURN notes;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_admin_notes(p_member_id UUID, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.members SET admin_notes = p_notes WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_group() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_see_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_member_admin_notes(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_member_admin_notes(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_group() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_admin_notes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_admin_notes(UUID, TEXT) TO authenticated;

REVOKE SELECT, INSERT, UPDATE ON TABLE public.members FROM PUBLIC, authenticated, anon;
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

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_select_scoped ON public.members;
CREATE POLICY members_select_scoped ON public.members
  FOR SELECT TO authenticated
  USING (public.can_see_member(id));
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

DROP POLICY IF EXISTS member_groups_select_scoped ON public.member_groups;
CREATE POLICY member_groups_select_scoped ON public.member_groups
  FOR SELECT TO authenticated
  USING (
    public.can_see_member(member_id)
    AND (
      public.current_role() <> 'group_leader'
      OR EXISTS (
        SELECT 1
        FROM public.groups AS g
        WHERE g.id = member_groups.group_id
          AND g.group_type = 'generational'
          AND CASE g.name
            WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
            WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
            WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
            WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
            ELSE g.name
          END = public.current_group()
      )
    )
  );
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

DROP POLICY IF EXISTS groups_select_by_role ON public.groups;
CREATE POLICY groups_select_by_role ON public.groups
  FOR SELECT TO authenticated
  USING (
    public.current_role() IN ('admin', 'user', 'viewer')
    OR (
      public.current_role() = 'group_leader'
      AND group_type = 'generational'
      AND CASE name
        WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
        WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
        WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
        WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
        ELSE name
      END = public.current_group()
    )
  );
DROP POLICY IF EXISTS groups_manage_staff ON public.groups;
CREATE POLICY groups_manage_staff ON public.groups
  FOR ALL TO authenticated
  USING (public.current_role() IN ('admin', 'user'))
  WITH CHECK (public.current_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS members_anon_sync ON public.members;
CREATE POLICY members_anon_sync ON public.members
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS member_groups_anon_sync ON public.member_groups;
CREATE POLICY member_groups_anon_sync ON public.member_groups
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS groups_anon_sync ON public.groups;
CREATE POLICY groups_anon_sync ON public.groups
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

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
CREATE POLICY contributions_select_non_leaders ON public.contributions
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
  USING (public.current_role() IN ('admin', 'user', 'viewer', 'group_leader'));
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
    CREATE POLICY attendance_sessions_select_scoped ON public.attendance_sessions
      FOR SELECT TO authenticated
      USING (
        public.current_role() IN ('admin', 'user', 'viewer')
        OR (
          public.current_role() = 'group_leader'
          AND CASE service_type
            WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
            WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
            WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
            WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
            ELSE service_type
          END = public.current_group()
        )
      );
    DROP POLICY IF EXISTS attendance_sessions_insert_scoped ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_insert_scoped ON public.attendance_sessions
      FOR INSERT TO authenticated
      WITH CHECK (
        public.current_role() IN ('admin', 'user')
      );
    DROP POLICY IF EXISTS attendance_sessions_update_scoped ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_update_scoped ON public.attendance_sessions
      FOR UPDATE TO authenticated
      USING (
        public.current_role() IN ('admin', 'user')
      )
      WITH CHECK (
        public.current_role() IN ('admin', 'user')
      );
    DROP POLICY IF EXISTS attendance_sessions_delete_admin ON public.attendance_sessions;
    CREATE POLICY attendance_sessions_delete_admin ON public.attendance_sessions
      FOR DELETE TO authenticated
      USING (public.current_role() = 'admin');
  END IF;

  IF to_regclass('public.attendance_records') IS NOT NULL THEN
    ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS attendance_records_select_scoped ON public.attendance_records;
    CREATE POLICY attendance_records_select_scoped ON public.attendance_records
      FOR SELECT TO authenticated
      USING (
        public.can_see_member(member_id)
        AND EXISTS (
          SELECT 1 FROM public.attendance_sessions AS s
          WHERE s.id = session_id
            AND (
              public.current_role() IN ('admin', 'user', 'viewer')
              OR (
                public.current_role() = 'group_leader'
                AND CASE s.service_type
                  WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
                  WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
                  WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
                  WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
                  ELSE s.service_type
                END = public.current_group()
              )
            )
        )
      );
    DROP POLICY IF EXISTS attendance_records_insert_scoped ON public.attendance_records;
    CREATE POLICY attendance_records_insert_scoped ON public.attendance_records
      FOR INSERT TO authenticated
      WITH CHECK (
        (
          public.current_role() IN ('admin', 'user')
          OR public.current_role() = 'group_leader'
        )
        AND public.can_see_member(member_id)
        AND EXISTS (
          SELECT 1 FROM public.attendance_sessions AS s
          WHERE s.id = session_id
            AND (
              public.current_role() IN ('admin', 'user')
              OR (
                public.current_role() = 'group_leader'
                AND CASE s.service_type
                  WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
                  WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
                  WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
                  WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
                  ELSE s.service_type
                END = public.current_group()
              )
            )
        )
      );
    DROP POLICY IF EXISTS attendance_records_delete_staff ON public.attendance_records;
    CREATE POLICY attendance_records_delete_staff ON public.attendance_records
      FOR DELETE TO authenticated
      USING (public.current_role() IN ('admin', 'user'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.attendance') IS NOT NULL THEN
    IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.attendance')) IN ('r', 'p') THEN
      ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS attendance_select_scoped ON public.attendance;
      CREATE POLICY attendance_select_scoped ON public.attendance
        FOR SELECT TO authenticated
        USING (
          public.current_role() IN ('admin', 'user', 'viewer')
          OR (
            public.current_role() = 'group_leader'
            AND public.can_see_member(NULLIF(to_jsonb(attendance)->>'member_id', '')::uuid)
            AND (
              NOT (to_jsonb(attendance) ? 'service_type')
              OR CASE to_jsonb(attendance)->>'service_type'
                WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
                WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
                WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
                WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
                ELSE to_jsonb(attendance)->>'service_type'
              END = public.current_group()
            )
          )
        );
      DROP POLICY IF EXISTS attendance_insert_scoped ON public.attendance;
      CREATE POLICY attendance_insert_scoped ON public.attendance
        FOR INSERT TO authenticated
        WITH CHECK (
          public.current_role() IN ('admin', 'user')
          OR (
            public.current_role() = 'group_leader'
            AND public.can_see_member(member_id)
            AND (
              NOT (to_jsonb(attendance) ? 'service_type')
              OR CASE to_jsonb(attendance)->>'service_type'
                WHEN 'YPG' THEN 'Young People''s Guild (YPG)'
                WHEN 'YAF' THEN 'Young Adults Fellowship (YAF)'
                WHEN 'Womens Fellowship' THEN 'Women''s Fellowship'
                WHEN 'Mens Fellowship' THEN 'Men''s Fellowship'
                ELSE to_jsonb(attendance)->>'service_type'
              END = public.current_group()
            )
          )
        );
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
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.special_events') IS NOT NULL THEN
    ALTER TABLE public.special_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS special_events_select_signed_in ON public.special_events;
    DROP POLICY IF EXISTS special_events_insert_staff ON public.special_events;
    DROP POLICY IF EXISTS special_events_update_staff ON public.special_events;
    DROP POLICY IF EXISTS special_events_delete_admin ON public.special_events;
    CREATE POLICY special_events_select_signed_in ON public.special_events
      FOR SELECT TO authenticated
      USING (public.current_role() IN ('admin', 'user', 'viewer', 'group_leader'));
    CREATE POLICY special_events_insert_staff ON public.special_events
      FOR INSERT TO authenticated
      WITH CHECK (public.current_role() IN ('admin', 'user'));
    CREATE POLICY special_events_update_staff ON public.special_events
      FOR UPDATE TO authenticated
      USING (public.current_role() IN ('admin', 'user'))
      WITH CHECK (public.current_role() IN ('admin', 'user'));
    CREATE POLICY special_events_delete_admin ON public.special_events
      FOR DELETE TO authenticated
      USING (public.current_role() = 'admin');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
