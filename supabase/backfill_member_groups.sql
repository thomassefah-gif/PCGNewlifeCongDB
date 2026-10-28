-- Link members imported from the Google Form (which only fill the text columns
-- generational_group / family_group / interest_groups) to real groups, so the
-- Groups tab and group filters work for them. Safe to re-run.
INSERT INTO public.member_groups (member_id, group_id, membership_status, is_primary, joined_at)
SELECT m.id, g.id, 'Active', (g.group_type = 'generational'), now()
FROM public.members AS m
JOIN LATERAL (
  SELECT trim(m.generational_group) AS name, 'generational' AS group_type
  UNION ALL SELECT trim(m.family_group), 'family'
  UNION ALL SELECT trim(x), 'interest' FROM unnest(string_to_array(COALESCE(m.interest_groups, ''), ',')) AS x
) AS wanted ON wanted.name <> ''
JOIN public.groups AS g
  ON lower(trim(g.name)) = lower(wanted.name) AND g.group_type = wanted.group_type
WHERE NOT EXISTS (
  SELECT 1 FROM public.member_groups AS mg WHERE mg.member_id = m.id AND mg.group_id = g.id
);
