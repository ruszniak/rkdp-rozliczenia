-- 044: Czas pracy przy kliencie (RKDP i M2 TAX): start/stop albo wpis ręczny, pakiet godzin klienta,
-- docelowa stawka godzinowa do oceny rentowności (app_settings.target_hourly_rate).
alter table public.clients add column if not exists package_hours numeric(6,2) check (package_hours is null or package_hours >= 0);
alter table public.m2_clients add column if not exists package_hours numeric(6,2) check (package_hours is null or package_hours >= 0);
insert into public.app_settings (key, value) values ('target_hourly_rate', '250') on conflict (key) do nothing;

create table if not exists public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.team_members(id) on delete cascade default public.current_member_id(),
  module        text not null check (module in ('rkdp', 'm2')),
  client_id     uuid references public.clients(id) on delete cascade,
  m2_client_id  uuid references public.m2_clients(id) on delete cascade,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  minutes       int check (minutes is null or minutes between 0 and 1440),
  note          text check (note is null or length(note) <= 500),
  billable      boolean not null default true,
  created_at    timestamptz not null default now(),
  check ((module = 'rkdp' and client_id is not null and m2_client_id is null) or (module = 'm2' and m2_client_id is not null and client_id is null)),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists time_entries_client_idx on public.time_entries (client_id, started_at);
create index if not exists time_entries_m2_idx on public.time_entries (m2_client_id, started_at);
create index if not exists time_entries_member_idx on public.time_entries (member_id, started_at);
create unique index if not exists time_entries_one_running on public.time_entries (member_id) where ended_at is null;  -- jeden licznik naraz

create or replace function public.can_see_time_client(p_module text, p_client uuid, p_m2 uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_module = 'rkdp' then public.has_full_access() or p_client in (select public.visible_client_ids())
              else public.has_module('doradztwo') end;
$$;
revoke all on function public.can_see_time_client(text, uuid, uuid) from public, anon;
grant execute on function public.can_see_time_client(text, uuid, uuid) to authenticated;

alter table public.time_entries enable row level security;
create policy te_select on public.time_entries for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()) or public.can_see_time_client(module, client_id, m2_client_id));
create policy te_insert on public.time_entries for insert to authenticated
  with check (member_id = (select public.current_member_id()) and public.can_see_time_client(module, client_id, m2_client_id));
create policy te_update on public.time_entries for update to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()))
  with check (member_id = (select public.current_member_id()) or (select public.is_admin()));
create policy te_delete on public.time_entries for delete to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.time_entries to authenticated;
