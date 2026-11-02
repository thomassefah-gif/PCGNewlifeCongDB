-- Ensure the Peace, Faith and Favour family groups exist (shown under Groups > Family Groups
-- and in the member form's Family Group dropdown). Safe to re-run.
do $$
declare
  n text;
begin
  -- Existing "Favor" is the same group as the form's "Favour".
  if not exists (select 1 from public.groups where group_type = 'family' and lower(trim(name)) = 'favour') then
    update public.groups set name = 'Favour', is_active = true
     where group_type = 'family' and lower(trim(name)) = 'favor';
  end if;

  foreach n in array array['Peace', 'Faith', 'Favour'] loop
    if exists (select 1 from public.groups where group_type = 'family' and lower(trim(name)) = lower(n)) then
      update public.groups set is_active = true
       where group_type = 'family' and lower(trim(name)) = lower(n);
    else
      insert into public.groups (name, description, group_type, is_active)
      values (n, n || ' family group', 'family', true);
    end if;
  end loop;

  -- Link members already naming these groups, only if the linking function exists.
  if to_regprocedure('public.link_member_text_groups(uuid)') is not null then
    perform public.link_member_text_groups(id) from public.members;
  end if;
end $$;

notify pgrst, 'reload schema';
