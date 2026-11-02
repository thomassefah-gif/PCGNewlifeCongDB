-- Self-contained, idempotent Membership ID setup (PCG/NLC/001, PCG/NLC/002, ...).
-- Safe to run even if the earlier membership migrations failed or were never run.

alter table public.members add column if not exists member_code text;
alter table public.members add column if not exists membership_id text;

create sequence if not exists public.member_code_seq;

-- SECURITY DEFINER so signed-in users and the form webhook can use the sequence.
create or replace function public.next_member_code()
returns text
language sql
security definer
set search_path = public
as $$
  select 'PCG/NLC/' || lpad(nextval('public.member_code_seq')::text, 3, '0');
$$;

-- Normalise older codes and carry over a code that only exists in membership_id.
update public.members set member_code = regexp_replace(member_code, '^PCG/LC/', 'PCG/NLC/') where member_code like 'PCG/LC/%';
update public.members set member_code = nullif(btrim(membership_id), '') where (member_code is null or btrim(member_code) = '') and nullif(btrim(membership_id), '') is not null;

do $$
declare max_existing integer;
begin
  select coalesce(max(substring(member_code from '^PCG/NLC/(\d+)$')::integer), 0) into max_existing from public.members;
  perform setval('public.member_code_seq', greatest(max_existing, 1), max_existing > 0);

  update public.members m
     set member_code = public.next_member_code()
    from (
      select id from public.members
       where member_code is null or btrim(member_code) = ''
       order by created_at, id
    ) o
   where m.id = o.id;

  update public.members set membership_id = member_code where membership_id is distinct from member_code;
end $$;

create or replace function public.set_member_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_code is null or btrim(new.member_code) = '' then
    if tg_op = 'UPDATE' and old.member_code is not null and btrim(old.member_code) <> '' then
      new.member_code := old.member_code;
    else
      new.member_code := public.next_member_code();
    end if;
  end if;
  new.membership_id := new.member_code;
  return new;
end $$;

drop trigger if exists trg_set_member_code on public.members;
create trigger trg_set_member_code
before insert or update on public.members
for each row execute function public.set_member_code();

create or replace function public.peek_next_member_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'PCG/NLC/' || lpad((select case when is_called then last_value + 1 else last_value end from public.member_code_seq)::text, 3, '0');
$$;

grant execute on function public.peek_next_member_code() to authenticated;

create unique index if not exists members_member_code_key on public.members (member_code);

notify pgrst, 'reload schema';
