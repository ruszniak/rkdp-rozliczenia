-- 042: (1) przychody klienta do pilnowania limitów (rok poprzedni, narastająco w bieżącym),
--      (2) pełnomocnictwa klienta z terminami (UPL-1, PEL, PPS-1, ZAW-FA, KSeF…).

create table if not exists public.client_revenue (
  client_id      uuid not null references public.clients(id) on delete cascade,
  year           int not null check (year between 2000 and 2100),
  amount         numeric(16,2) not null check (amount >= 0),
  through_month  int not null default 12 check (through_month between 1 and 12),  -- 12 = cały rok
  source         text not null default 'reczny' check (source in ('reczny', 'jpk')),
  updated_by     uuid references public.team_members(id) on delete set null default public.current_member_id(),
  updated_at     timestamptz not null default now(),
  primary key (client_id, year)
);
alter table public.client_revenue enable row level security;
create policy cr_select on public.client_revenue for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cr_insert on public.client_revenue for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cr_update on public.client_revenue for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cr_delete on public.client_revenue for delete to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
grant select, insert, update, delete on public.client_revenue to authenticated;

create table if not exists public.client_poa (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  kind        text not null check (kind in ('UPL-1', 'PEL', 'PPO-1', 'PPS-1', 'ZAW-FA', 'KSeF', 'inne')),
  scope       text check (scope is null or length(scope) <= 500),
  office      text check (office is null or length(office) <= 200),
  holder_id   uuid references public.team_members(id) on delete set null,
  holder_name text check (holder_name is null or length(holder_name) <= 200),
  valid_from  date,
  valid_to    date,
  revoked_at  date,
  note        text check (note is null or length(note) <= 500),
  created_by  uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at  timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index if not exists client_poa_idx on public.client_poa (client_id);
alter table public.client_poa enable row level security;
create policy cp_select on public.client_poa for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cp_insert on public.client_poa for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cp_update on public.client_poa for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cp_delete on public.client_poa for delete to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
grant select, insert, update, delete on public.client_poa to authenticated;
