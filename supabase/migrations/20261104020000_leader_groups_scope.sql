-- Group leaders can only read their own assigned group (not every group).
DROP POLICY IF EXISTS groups_select_leader ON public.groups;
CREATE POLICY groups_select_leader ON public.groups
  FOR SELECT TO authenticated
  USING (
    public.current_role() = 'group_leader'
    AND lower(btrim(name)) = lower(btrim(public.current_group()))
  );

NOTIFY pgrst, 'reload schema';
