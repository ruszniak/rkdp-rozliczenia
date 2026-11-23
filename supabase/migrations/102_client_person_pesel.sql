-- PESEL osób po stronie klienta (osoba udzielająca PEL, użytkownik KSeF w ZAW-FA, użytkownik konta organizacji – UKO).
-- Osobna tabela (jak member_private): widzą ją tylko osoby z dostępem do danego klienta RKDP.
create table if not exists public.client_person_pesel (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  pesel text not null check (pesel ~ '^\d{11}$'),
  updated_by uuid references public.team_members(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists client_person_pesel_uq on public.client_person_pesel (client_id, lower(first_name), lower(last_name));
alter table public.client_person_pesel enable row level security;
create policy client_person_pesel_rw on public.client_person_pesel for all to authenticated
  using ((select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())))
  with check ((select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())));
comment on table public.client_person_pesel is 'PESEL osób klienta do formularzy (PEL, ZAW-FA, UKO) – zapisywany przy generowaniu/wysyłce dokumentu';
