-- Ensure the Peace, Faith and Favour family groups exist (shown under Groups > Family Groups
-- and in the member form's Family Group dropdown). Safe to re-run.
do $$
declare
  n text;
begin
  foreach n in array array['Peace', 'Faith', 'Favour'] loop
    if exists (select 1 from public.groups where group_type = 'family' and lower(trim(name)) = lower(n)) then
      update public.groups set is_active = true
       where group_type = 'family' and lower(trim(name)) = lower(n);
    else
      insert into public.groups (name, description, group_type, is_active)
      values (n, n || ' family group', 'family', true);
    end if;
  end loop;
end $$;

-- Link any members whose form choice already named one of these groups.
select public.link_member_text_groups(id) from public.members;

notify pgrst, 'reload schema';
