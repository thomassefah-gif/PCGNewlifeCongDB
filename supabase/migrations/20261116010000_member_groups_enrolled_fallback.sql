-- Group links created without an enrolled date (joined_at) take the member's form-fill date (members.created_at).
CREATE OR REPLACE FUNCTION public.set_member_group_enrolled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.joined_at IS NULL THEN
    SELECT created_at INTO NEW.joined_at FROM public.members WHERE id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_groups_enrolled ON public.member_groups;
CREATE TRIGGER member_groups_enrolled
BEFORE INSERT OR UPDATE ON public.member_groups
FOR EACH ROW EXECUTE FUNCTION public.set_member_group_enrolled();

-- Backfill existing blanks.
UPDATE public.member_groups mg
SET joined_at = m.created_at
FROM public.members m
WHERE m.id = mg.member_id AND mg.joined_at IS NULL AND m.created_at IS NOT NULL;
