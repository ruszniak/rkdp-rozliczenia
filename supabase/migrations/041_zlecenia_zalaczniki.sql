-- 041: Załączniki w zleceniach (zdjęcia, PDF, dokumenty) – do samego zlecenia albo do komentarza / zgłoszenia / pytania.
-- Prywatny schowek „zlecenia” (max 25 MB na plik), dostęp tylko dla osób, które widzą zlecenie (administrator i wykonawca).

insert into storage.buckets (id, name, public, file_size_limit)
values ('zlecenia', 'zlecenia', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create table if not exists public.zlecenia_pliki (
  id           uuid primary key default gen_random_uuid(),
  zlecenie_id  uuid not null references public.zlecenia(id) on delete cascade,
  wpis_id      uuid references public.zlecenia_wpisy(id) on delete set null,
  path         text not null unique,          -- <zlecenie_id>/<uuid>-<nazwa>
  name         text not null,
  mime         text,
  size         bigint,
  uploaded_by  uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at   timestamptz not null default now()
);
create index if not exists zlecenia_pliki_idx on public.zlecenia_pliki (zlecenie_id, created_at);

create or replace function public.zl_visible(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zlecenia z where z.id = p_id and (public.is_admin() or z.assignee_id = public.current_member_id()));
$$;
revoke all on function public.zl_visible(uuid) from public, anon;
grant execute on function public.zl_visible(uuid) to authenticated;

alter table public.zlecenia_pliki enable row level security;
create policy zp_select on public.zlecenia_pliki for select to authenticated using (public.zl_visible(zlecenie_id));
create policy zp_insert on public.zlecenia_pliki for insert to authenticated
  with check (uploaded_by = (select public.current_member_id()) and public.zl_visible(zlecenie_id) and path like zlecenie_id::text || '/%');
create policy zp_update on public.zlecenia_pliki for update to authenticated
  using (uploaded_by = (select public.current_member_id()) and public.zl_visible(zlecenie_id))
  with check (uploaded_by = (select public.current_member_id()) and public.zl_visible(zlecenie_id));
create policy zp_delete on public.zlecenia_pliki for delete to authenticated
  using (uploaded_by = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.zlecenia_pliki to authenticated;

-- pliki w schowku: odczyt i wgrywanie tylko w folderze widocznego zlecenia
create policy zlecenia_read on storage.objects for select to authenticated
  using (bucket_id = 'zlecenia' and public.zl_visible(nullif((storage.foldername(name))[1], '')::uuid));
create policy zlecenia_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'zlecenia' and public.zl_visible(nullif((storage.foldername(name))[1], '')::uuid));
create policy zlecenia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'zlecenia' and ((select public.is_admin()) or (owner_id = (select auth.uid())::text and not public.file_protected(bucket_id, objects.name))));

-- kosz: usunięte załączniki zleceń też trafiają do kosza (30 dni)
alter table public.file_trash drop constraint if exists file_trash_source_check;
alter table public.file_trash add constraint file_trash_source_check check (source in ('client_files', 'period_files', 'rkdp_ticket_files', 'zlecenia_pliki'));

create or replace function public.file_to_trash() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.file_trash (source, bucket, path, name, size, client_id, row_data, deleted_by)
  values (tg_table_name,
          case tg_table_name when 'client_files' then 'klienci' when 'period_files' then 'rozliczenia' when 'zlecenia_pliki' then 'zlecenia' else 'zgloszenia' end,
          old.path, old.name, old.size, nullif(to_jsonb(old) ->> 'client_id', '')::uuid, to_jsonb(old), public.current_member_id());
  return old;
end $$;
create trigger zlecenia_pliki_trash after delete on public.zlecenia_pliki for each row execute function public.file_to_trash();

create or replace function public.file_protected(p_bucket text, p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.file_trash where bucket = p_bucket and path = p_path)
      or (p_bucket = 'klienci' and exists (select 1 from public.client_files where path = p_path))
      or (p_bucket = 'rozliczenia' and exists (select 1 from public.period_files where path = p_path))
      or (p_bucket = 'zgloszenia' and exists (select 1 from public.rkdp_ticket_files where path = p_path))
      or (p_bucket = 'zlecenia' and exists (select 1 from public.zlecenia_pliki where path = p_path));
$$;
