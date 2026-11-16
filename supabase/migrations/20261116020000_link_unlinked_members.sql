-- Safety net so Google Form members always land in their groups.
-- 1. Re-assert the insert/update trigger (idempotent) in case it was never applied.
-- 2. link_unlinked_members(): links members that have NO group rows yet, callable from the app.
-- 3. Backfill now.

DROP TRIGGER IF EXISTS link_member_text_groups ON public.members;
CREATE TRIGGER link_member_text_groups
AFTER INSERT OR UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.trg_link_member_text_groups();

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
    SELECT id FROM public.members
    WHERE NOT EXISTS (SELECT 1 FROM public.member_groups mg WHERE mg.member_id = members.id)
  LOOP
    PERFORM public.link_member_text_groups(m.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_unlinked_members() TO authenticated;

SELECT public.link_unlinked_members();

NOTIFY pgrst, 'reload schema';
