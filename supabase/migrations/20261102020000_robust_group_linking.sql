-- Make Google Form group choices reliably appear on the Groups tab.
-- Reads every text column the form/sync may write, matches group names ignoring case,
-- punctuation and bracketed notes, and links them through member_groups.

CREATE OR REPLACE FUNCTION public.norm_group_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(regexp_replace(coalesce(p, ''), '\([^)]*\)', '', 'g')), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.link_member_text_groups(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j jsonb;
BEGIN
  SELECT to_jsonb(m) INTO j FROM public.members m WHERE m.id = p_member_id;
  IF j IS NULL THEN RETURN; END IF;

  INSERT INTO public.member_groups (member_id, group_id, membership_status, is_primary, joined_at)
  SELECT DISTINCT ON (g.id) p_member_id, g.id, 'Active', (w.kind = 'generational'), now()
  FROM (
    SELECT trim(v) AS name, 'generational' AS kind
      FROM unnest(ARRAY[j->>'generational_group', j->>'primary_generational_group']) AS v
    UNION ALL
    SELECT trim(v), 'family'
      FROM unnest(ARRAY[j->>'family_group', j->>'church_family_group', j->>'family']) AS v
    UNION ALL
    SELECT trim(x), 'interest'
      FROM unnest(regexp_split_to_array(coalesce(j->>'interest_groups', ''), '[,;\n]')) AS x
  ) AS w
  JOIN public.groups g
    ON public.norm_group_name(g.name) <> ''
   AND (public.norm_group_name(g.name) = public.norm_group_name(w.name)
        OR public.norm_group_name(w.name) LIKE public.norm_group_name(g.name) || '%')
   AND g.is_active
  WHERE w.name <> '' AND w.name !~* '^no (family group|group membership)$'
  ORDER BY g.id
  ON CONFLICT (member_id, group_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_link_member_text_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keys text[] := ARRAY['generational_group','primary_generational_group','family_group','church_family_group','family','interest_groups'];
  k text;
  changed boolean := (TG_OP = 'INSERT');
BEGIN
  -- On update only react when these text values changed, so groups removed in the app are not re-added.
  IF NOT changed THEN
    FOREACH k IN ARRAY keys LOOP
      IF to_jsonb(NEW)->>k IS DISTINCT FROM to_jsonb(OLD)->>k THEN changed := true; END IF;
    END LOOP;
  END IF;
  IF changed THEN PERFORM public.link_member_text_groups(NEW.id); END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS link_member_text_groups ON public.members;
CREATE TRIGGER link_member_text_groups
AFTER INSERT OR UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.trg_link_member_text_groups();

-- Backfill all existing members.
SELECT public.link_member_text_groups(id) FROM public.members;

NOTIFY pgrst, 'reload schema';
