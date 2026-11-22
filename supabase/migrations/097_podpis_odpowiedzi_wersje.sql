-- 097: odpowiedzi biura na uwagi klienta i kolejne wersje dokumentu pod tym samym linkiem do podpisu.
alter table public.sign_requests add column if not exists version int not null default 1;
alter table public.sign_requests add column if not exists changes text check (changes is null or length(changes) <= 2000);

alter table public.sign_notes add column if not exists version int;
alter table public.sign_notes add column if not exists verdict text check (verdict is null or verdict in ('przyjete','czesciowo','odrzucone'));
alter table public.sign_notes add column if not exists author_member uuid references public.team_members(id) on delete set null;

-- poprzednie wersje dokumentu (bieżąca jest w sign_requests)
create table if not exists public.sign_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  version int not null,
  doc_html text check (doc_html is null or length(doc_html) <= 1500000),
  file_id uuid references public.client_files(id) on delete set null,
  file_path text,
  changes text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id, version)
);
alter table public.sign_versions enable row level security;
create policy sv_select on public.sign_versions for select to authenticated
  using (request_id in (select id from public.sign_requests));
grant select on public.sign_versions to authenticated;
