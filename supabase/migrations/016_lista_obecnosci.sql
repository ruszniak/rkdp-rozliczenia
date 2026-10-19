-- 016: lista obecności / ewidencja czasu pracy.
-- Każdy pracownik prowadzi własną listę (niezależnie od modułów).
-- Widzą ją: sam pracownik, administrator oraz osoby z ustawionym zakresem attendance_scope
-- (np. Marcin Otręba – 'm2tax.pl' → widzi listy osób z adresem @m2tax.pl).
-- Zmieniać wpisy może sam pracownik i administrator.

alter table public.team_members add column if not exists attendance_scope text;
comment on column public.team_members.attendance_scope is 'Domena e-mail, której listy obecności ta osoba może przeglądać (np. m2tax.pl).';

create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.team_members(id) on delete cascade,
  day        date not null,
  kind       text not null default 'praca' check (kind in
               ('praca','zdalna','delegacja','szkolenie','urlop','urlop_zadanie','okolicznosciowy','opieka','bezplatny','l4','wolne','nieobecnosc')),
  start_time time,
  end_time   time,
  break_min  int not null default 0 check (break_min between 0 and 600),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, day)
);
create index if not exists attendance_day_idx on public.attendance (day);

drop trigger if exists attendance_touch on public.attendance;
create trigger attendance_touch before update on public.attendance for each row execute function public.touch_row();

create or replace function public.can_see_attendance(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = public.current_member_id()
      or public.is_admin()
      or exists (
        select 1 from team_members v, team_members t
        where v.id = public.current_member_id() and v.active
          and coalesce(v.attendance_scope, '') <> ''
          and t.id = target
          and lower(t.email) like '%@' || lower(trim(v.attendance_scope)))
$$;
revoke execute on function public.can_see_attendance(uuid) from public, anon;
grant execute on function public.can_see_attendance(uuid) to authenticated;

alter table public.attendance enable row level security;
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using ((select public.can_see_attendance(member_id)));
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check (member_id = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()))
  with check (member_id = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.attendance to authenticated;

-- Marcin Otręba widzi listy obecności pracowników M2 TAX (adresy @m2tax.pl)
update public.team_members set attendance_scope = 'm2tax.pl' where lower(email) = 'marcin.otreba@m2tax.pl';
