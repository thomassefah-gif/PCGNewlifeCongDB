-- 1. Group matching: also accept the bracketed abbreviation (e.g. "YPG") and a missing "s"/apostrophe
--    so a Google Form answer such as "Young People's Guild" or "YPG" always finds its group.
-- 2. "Date Enrolled" in a group = the date the member's form was filled (members.created_at),
--    not the moment the link was created.

CREATE OR REPLACE FUNCTION public.group_abbrev(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(substring(p from '\(([^)]*)\)'), '')), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.link_member_text_groups(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j jsonb;
  enrolled timestamptz;
BEGIN
  SELECT to_jsonb(m), m.created_at INTO j, enrolled FROM public.members m WHERE m.id = p_member_id;
  IF j IS NULL THEN RETURN; END IF;

  INSERT INTO public.member_groups (member_id, group_id, membership_status, is_primary, joined_at)
  SELECT DISTINCT ON (g.id) p_member_id, g.id, 'Active', (w.kind = 'generational'), coalesce(enrolled, now())
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
        OR public.norm_group_name(w.name) LIKE public.norm_group_name(g.name) || '%'
        OR (public.group_abbrev(g.name) <> ''
            AND (public.norm_group_name(w.name) = public.group_abbrev(g.name)
                 OR public.group_abbrev(w.name) = public.group_abbrev(g.name))))
   AND g.is_active
  WHERE w.name <> '' AND w.name !~* '^no (family group|group membership)$'
  ORDER BY g.id
  ON CONFLICT (member_id, group_id) DO NOTHING;
END;
$$;

-- Existing links get the member's form-fill date as their enrolled date.
UPDATE public.member_groups mg
SET joined_at = m.created_at
FROM public.members m
WHERE m.id = mg.member_id AND m.created_at IS NOT NULL;

-- Re-run linking for everyone so members missed before (e.g. Simon) are added.
SELECT public.link_member_text_groups(id) FROM public.members;

NOTIFY pgrst, 'reload schema';
