-- Remove maiden name everywhere (including existing rows).
alter table public.members drop column if exists maiden_name;

-- Membership ID: PCG/NLC/001, PCG/NLC/002, ...
create sequence if not exists public.member_code_seq;

create or replace function public.next_member_code()
returns text
language sql
as $$
  select 'PCG/NLC/' || lpad(nextval('public.member_code_seq')::text, 3, '0');
$$;

-- Fill existing members that have no code, oldest first, continuing after any existing PCG/NLC codes.
do $$
declare
  max_existing integer;
  has_alias boolean;
begin
  select coalesce(max(substring(member_code from '^PCG/NLC/(\d+)$')::integer), 0)
    into max_existing from public.members;
  perform setval('public.member_code_seq', greatest(max_existing, 1), max_existing > 0);

  update public.members m
     set member_code = public.next_member_code()
    from (
      select id from public.members
       where member_code is null or btrim(member_code) = ''
       order by created_at, id
    ) o
   where m.id = o.id;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'members' and column_name = 'membership_id'
  ) into has_alias;
  if has_alias then
    execute 'update public.members set membership_id = member_code';
  end if;
end $$;

-- Generate the code automatically for every new member.
create or replace function public.set_member_code()
returns trigger
language plpgsql
as $$
begin
  if new.member_code is null or btrim(new.member_code) = '' then
    new.member_code := public.next_member_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_set_member_code on public.members;
create trigger trg_set_member_code
before insert on public.members
for each row execute function public.set_member_code();

create unique index if not exists members_member_code_key on public.members (member_code);
