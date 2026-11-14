-- Podpis umowy przez link: podgląd treści na stronie (bez załącznika w e-mailu) i uwagi zgłaszane przez klienta.
alter table public.sign_requests add column if not exists doc_html text check (doc_html is null or length(doc_html) <= 1500000);

create table if not exists public.sign_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  author text check (author is null or length(author) <= 120),
  from_client boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sign_notes_req_idx on public.sign_notes(request_id, created_at);
alter table public.sign_notes enable row level security;
create policy sn_select on public.sign_notes for select to authenticated
  using (request_id in (select id from public.sign_requests));   -- widoczność jak prośby o podpis (RLS sign_requests)
