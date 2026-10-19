-- 017: załączniki (zrzuty ekranu, PDF, inne pliki) do uwag klienta w Rozliczeniach – per klient i miesiąc.
-- Widzą je te same osoby, co uwagi (pełny dostęp albo przypisani do klienta).
create table if not exists public.period_files (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  period      date not null,
  path        text not null unique,          -- <client_id>/<yyyy-mm>/<uuid>-<nazwa>
  name        text not null,
  mime        text,
  size        bigint,
  uploaded_by uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at  timestamptz not null default now()
);
create index if not exists period_files_idx on public.period_files (period, client_id);

alter table public.period_files enable row level security;
drop policy if exists period_files_select on public.period_files;
create policy period_files_select on public.period_files for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists period_files_insert on public.period_files;
create policy period_files_insert on public.period_files for insert to authenticated
  with check (uploaded_by = (select public.current_member_id())
    and ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
    and path like client_id::text || '/%');
drop policy if exists period_files_delete on public.period_files;
create policy period_files_delete on public.period_files for delete to authenticated
  using (uploaded_by = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, delete on public.period_files to authenticated;

-- prywatny schowek (max 25 MB na plik); pierwszy folder ścieżki = id klienta
insert into storage.buckets (id, name, public, file_size_limit)
values ('rozliczenia', 'rozliczenia', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists rozliczenia_read on storage.objects;
create policy rozliczenia_read on storage.objects for select to authenticated
  using (bucket_id = 'rozliczenia' and ((select public.has_full_access())
    or (storage.foldername(name))[1] in (select id::text from public.visible_client_ids() as v(id))));
drop policy if exists rozliczenia_upload on storage.objects;
create policy rozliczenia_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'rozliczenia' and (select public.current_member_id()) is not null and ((select public.has_full_access())
    or (storage.foldername(name))[1] in (select id::text from public.visible_client_ids() as v(id))));
drop policy if exists rozliczenia_delete on storage.objects;
create policy rozliczenia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'rozliczenia' and (owner_id = (select auth.uid())::text or (select public.is_admin())));
