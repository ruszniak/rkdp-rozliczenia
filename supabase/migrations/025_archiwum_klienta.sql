-- 025: archiwum dokumentów współpracy z klientem (umowy, pełnomocnictwa, dokumenty rejestrowe, AML/KYC, korespondencja…)
-- – niezależne od miesięcznych rozliczeń. Pliki w prywatnym koszyku „klienci”, ścieżka <client_id>/<losowe>-<nazwa>.

insert into storage.buckets (id, name, public, file_size_limit)
values ('klienci', 'klienci', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create table if not exists public.client_files (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  category    text not null default 'inne' check (category in ('umowa', 'pelnomocnictwo', 'rejestrowe', 'aml', 'korespondencja', 'inne')),
  name        text not null check (length(name) between 1 and 200),
  note        text check (length(note) <= 500),
  path        text not null unique,
  mime        text,
  size        bigint,
  uploaded_by uuid default public.current_member_id() references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists client_files_idx on public.client_files (client_id, created_at desc);

alter table public.client_files enable row level security;
drop policy if exists cf_select on public.client_files;
create policy cf_select on public.client_files for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists cf_insert on public.client_files;
create policy cf_insert on public.client_files for insert to authenticated
  with check (((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
              and uploaded_by = (select public.current_member_id()));
drop policy if exists cf_update on public.client_files;
create policy cf_update on public.client_files for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists cf_delete on public.client_files;
create policy cf_delete on public.client_files for delete to authenticated
  using (uploaded_by = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.client_files to authenticated;

-- edycja tylko kategorii, nazwy i opisu
create or replace function public.client_files_guard() returns trigger language plpgsql as $$
begin
  new.client_id := old.client_id; new.path := old.path; new.mime := old.mime; new.size := old.size;
  new.uploaded_by := old.uploaded_by; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists client_files_guard on public.client_files;
create trigger client_files_guard before update on public.client_files for each row execute function public.client_files_guard();

-- pliki w koszyku: dostęp jak do klienta (pierwszy katalog ścieżki = id klienta)
drop policy if exists klienci_read on storage.objects;
create policy klienci_read on storage.objects for select to authenticated
  using (bucket_id = 'klienci' and ((select public.has_full_access()) or (storage.foldername(name))[1] in (select v.id::text from public.visible_client_ids() v(id))));
drop policy if exists klienci_upload on storage.objects;
create policy klienci_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'klienci' and (select public.current_member_id()) is not null
              and ((select public.has_full_access()) or (storage.foldername(name))[1] in (select v.id::text from public.visible_client_ids() v(id))));
drop policy if exists klienci_delete on storage.objects;
create policy klienci_delete on storage.objects for delete to authenticated
  using (bucket_id = 'klienci' and (owner_id = (select auth.uid())::text or (select public.is_admin())));
