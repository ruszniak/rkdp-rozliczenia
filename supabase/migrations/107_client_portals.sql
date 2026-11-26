-- Strona klienta: jeden stały link (app.ruszniak.io/klient/#<token>) – dokumenty do pobrania, do podpisu, wgrywanie, spotkania
create table if not exists public.client_portals (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  client_id uuid references public.clients(id) on delete cascade,
  m2_client_id uuid references public.m2_clients(id) on delete cascade,
  firm text not null default 'rkdp' check (firm in ('rkdp','m2')),
  created_by uuid default public.current_member_id() references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  views integer not null default 0,
  last_view_at timestamptz,
  check (client_id is not null or m2_client_id is not null)
);
create unique index if not exists client_portals_one_rk on public.client_portals (client_id) where revoked_at is null and client_id is not null;
create unique index if not exists client_portals_one_m2 on public.client_portals (m2_client_id) where revoked_at is null and m2_client_id is not null and client_id is null;
alter table public.client_portals enable row level security;
drop policy if exists client_portals_staff on public.client_portals;
create policy client_portals_staff on public.client_portals for all to authenticated
  using ((client_id is not null and (public.has_full_access() or client_id in (select public.visible_client_ids())))
      or (client_id is null and m2_client_id is not null and public.m2_client_ok(m2_client_id)))
  with check ((client_id is not null and (public.has_full_access() or client_id in (select public.visible_client_ids())))
      or (client_id is null and m2_client_id is not null and public.m2_client_ok(m2_client_id)));
comment on table public.client_portals is 'Stały link klienta do strony /klient/ (dokumenty, podpisy, wgrywanie, spotkania); odczyt przez funkcję portal (service role)';
