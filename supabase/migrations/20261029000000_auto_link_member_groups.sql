-- Google Form submissions only fill the text columns generational_group / family_group /
-- interest_groups. This links those names to real groups (member_groups) automatically,
-- so the member appears in the group's member list.

CREATE OR REPLACE FUNCTION public.link_member_text_groups(p_member_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.member_groups (member_id, group_id, membership_status, is_primary, joined_at)
  SELECT m.id, g.id, 'Active', (wanted.kind = 'generational'), now()
  FROM public.members AS m
  JOIN LATERAL (
    SELECT trim(m.generational_group) AS name, 'generational' AS kind
    UNION ALL SELECT trim(m.family_group), 'family'
    UNION ALL SELECT trim(x), 'interest'
      FROM unnest(string_to_array(COALESCE(m.interest_groups, ''), ',')) AS x
  ) AS wanted ON wanted.name <> '' AND wanted.name !~* '^no (family group|group membership)$'
  JOIN public.groups AS g ON lower(trim(g.name)) = lower(wanted.name)
  WHERE m.id = p_member_id
  ON CONFLICT (member_id, group_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.trg_link_member_text_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On update only react when the text columns actually changed, so groups removed
  -- in the app are not silently re-added.
  IF TG_OP = 'INSERT'
     OR NEW.generational_group IS DISTINCT FROM OLD.generational_group
     OR NEW.family_group IS DISTINCT FROM OLD.family_group
     OR NEW.interest_groups IS DISTINCT FROM OLD.interest_groups THEN
    PERFORM public.link_member_text_groups(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS link_member_text_groups ON public.members;
CREATE TRIGGER link_member_text_groups
AFTER INSERT OR UPDATE OF generational_group, family_group, interest_groups ON public.members
FOR EACH ROW EXECUTE FUNCTION public.trg_link_member_text_groups();

-- One-time backfill for members already in the table.
SELECT public.link_member_text_groups(id) FROM public.members;

NOTIFY pgrst, 'reload schema';
