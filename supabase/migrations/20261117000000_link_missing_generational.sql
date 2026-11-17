-- Fix: members who already belonged to some group (e.g. a family group) were skipped, so their
-- generational group from the form was never linked. Now a member is (re)linked when they are
-- missing a link for any group named in their form text.

CREATE OR REPLACE FUNCTION public.link_unlinked_members()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  n integer := 0;
BEGIN
  FOR m IN
    SELECT id FROM public.members mem
    WHERE
      -- no group rows at all
      NOT EXISTS (SELECT 1 FROM public.member_groups mg WHERE mg.member_id = mem.id)
      -- or a generational group is written on the form but no generational group is linked
      OR (
        coalesce(nullif(btrim(coalesce(mem.generational_group, mem.primary_generational_group, '')), ''), '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.member_groups mg
          JOIN public.groups g ON g.id = mg.group_id
          WHERE mg.member_id = mem.id AND g.group_type = 'generational'
        )
      )
  LOOP
    PERFORM public.link_member_text_groups(m.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_unlinked_members() TO authenticated;

-- Backfill: link every member to the groups named in their form text (existing links are kept).
SELECT public.link_member_text_groups(id) FROM public.members;

NOTIFY pgrst, 'reload schema';
