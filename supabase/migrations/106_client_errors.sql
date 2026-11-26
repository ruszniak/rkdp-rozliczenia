-- Dziennik błędów i zawieszeń z przeglądarek zespołu (diagnoza „aplikacja się zawiesza”)
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  member_id uuid default public.current_member_id() references public.team_members(id) on delete set null,
  kind text not null check (kind in ('error','promise','timeout','slow','freeze','offline')),
  message text not null check (char_length(message) <= 1000),
  detail text check (char_length(detail) <= 4000),
  route text check (char_length(route) <= 200),
  build text check (char_length(build) <= 40),
  ua text check (char_length(ua) <= 300),
  ms integer
);
create index if not exists client_errors_at on public.client_errors (at desc);
alter table public.client_errors enable row level security;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to authenticated
  with check (member_id is not distinct from public.current_member_id());
drop policy if exists client_errors_admin on public.client_errors;
create policy client_errors_admin on public.client_errors for select to authenticated using (public.is_admin());
comment on table public.client_errors is 'Błędy i zawieszenia zgłaszane automatycznie przez aplikację w przeglądarce (bez treści danych klientów) – wgląd: administrator';
