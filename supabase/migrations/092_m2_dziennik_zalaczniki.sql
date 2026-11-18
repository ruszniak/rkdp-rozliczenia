-- 092: Załączniki do wpisów w dzienniku sprawy (M2 TAX / doradztwo): skany pism, protokoły, zdjęcia, PDF.
-- Prywatny schowek „sprawy” (max 25 MB na plik), ścieżka <matter_id>/<uuid>-<nazwa>; dostęp jak do sprawy (m2_matter_ok).

insert into storage.buckets (id, name, public, file_size_limit)
values ('sprawy', 'sprawy', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create table if not exists public.m2_journal_files (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references public.m2_matters(id) on delete cascade,
  journal_id   uuid references public.m2_journal(id) on delete cascade,
  path         text not null unique,
  name         text not null,
  mime         text,
  size         bigint,
  uploaded_by  uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at   timestamptz not null default now()
);
create index if not exists m2_journal_files_idx on public.m2_journal_files (matter_id, journal_id);

alter table public.m2_journal_files enable row level security;
create policy m2jf_select on public.m2_journal_files for select to authenticated using (public.m2_matter_ok(matter_id));
create policy m2jf_insert on public.m2_journal_files for insert to authenticated
  with check (public.m2_matter_ok(matter_id) and path like matter_id::text || '/%');
create policy m2jf_delete on public.m2_journal_files for delete to authenticated
  using (public.m2_matter_ok(matter_id) and (uploaded_by = (select public.current_member_id()) or (select public.is_admin())));
grant select, insert, delete on public.m2_journal_files to authenticated;

create policy sprawy_read on storage.objects for select to authenticated
  using (bucket_id = 'sprawy' and public.m2_matter_ok(nullif((storage.foldername(name))[1], '')::uuid));
create policy sprawy_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'sprawy' and (select public.current_member_id()) is not null and public.m2_matter_ok(nullif((storage.foldername(name))[1], '')::uuid));
create policy sprawy_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sprawy' and ((select public.is_admin()) or owner_id = (select auth.uid())::text));
