create table if not exists public.doc_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  client_id uuid references public.clients(id) on delete cascade,
  path text not null,
  name text not null,
  title text,
  firm text not null default 'rkdp',
  email text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  downloads int not null default 0,
  last_download_at timestamptz
);
comment on table public.doc_links is 'Pliki wysyłane klientom linkiem zamiast załącznika (UPL-1, ZAW-FA, UKO, PEL) – strona /pobierz/?t=…, link ważny 30 dni; dostęp tylko przez funkcję podpis (service role)';
alter table public.doc_links enable row level security;
create policy doc_links_staff_select on public.doc_links for select to authenticated using (public.current_member_id() is not null);
