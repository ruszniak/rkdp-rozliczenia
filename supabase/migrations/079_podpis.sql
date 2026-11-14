-- Prośby o podpis dokumentu (np. umowy) – klient dostaje e-mail z PDF i link do strony /podpis/?t=…,
-- gdzie podpisuje dokument (profil zaufany, e-dowód, podpis kwalifikowany) i wgrywa podpisany plik.
-- Oryginał i podpisany plik trafiają do archiwum klienta (bucket „klienci”, tabela client_files).
create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{48}$'),
  title text not null check (length(title) between 1 and 200),
  email text,
  file_id uuid references public.client_files(id) on delete set null,
  signed_file_id uuid references public.client_files(id) on delete set null,
  status text not null default 'wyslano' check (status in ('wyslano', 'podpisano', 'anulowano')),
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz not null default now() + interval '60 days'
);
create index if not exists sign_requests_client_idx on public.sign_requests(client_id, created_at desc);
alter table public.sign_requests enable row level security;
create policy sr_select on public.sign_requests for select to authenticated
  using ((select has_full_access()) or client_id in (select visible_client_ids()));
create policy sr_update on public.sign_requests for update to authenticated
  using ((select has_full_access()) or client_id in (select visible_client_ids()))
  with check ((select has_full_access()) or client_id in (select visible_client_ids()));
