-- 039: Kosz na usunięte pliki (30 dni). Usunięcie załącznika w aplikacji usuwa tylko wpis z listy – sam plik zostaje
-- w magazynie, a wpis trafia do kosza (file_trash). Administrator może go przywrócić albo usunąć na zawsze;
-- po 30 dniach funkcja „kosz” (harmonogram, codziennie) usuwa plik z magazynu na stałe.

create table if not exists public.file_trash (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('client_files', 'period_files', 'rkdp_ticket_files')),
  bucket       text not null,
  path         text not null,
  name         text,
  size         bigint,
  client_id    uuid,
  row_data     jsonb not null,
  deleted_by   uuid references public.team_members(id) on delete set null,
  deleted_at   timestamptz not null default now(),
  purge_after  timestamptz not null default now() + interval '30 days'
);
create index if not exists file_trash_purge_idx on public.file_trash (purge_after);
create index if not exists file_trash_path_idx on public.file_trash (bucket, path);

alter table public.file_trash enable row level security;
create policy ft_select on public.file_trash for select to authenticated using ((select public.is_admin()));
create policy ft_delete on public.file_trash for delete to authenticated using ((select public.is_admin()));
grant select, delete on public.file_trash to authenticated;

-- każde usunięcie wpisu o pliku (także kaskadowe, np. przy usunięciu klienta lub zadania) → kosz
create or replace function public.file_to_trash() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.file_trash (source, bucket, path, name, size, client_id, row_data, deleted_by)
  values (tg_table_name,
          case tg_table_name when 'client_files' then 'klienci' when 'period_files' then 'rozliczenia' else 'zgloszenia' end,
          old.path, old.name, old.size, nullif(to_jsonb(old) ->> 'client_id', '')::uuid, to_jsonb(old), public.current_member_id());
  return old;
end $$;
revoke all on function public.file_to_trash() from public, anon, authenticated;

create trigger client_files_trash after delete on public.client_files for each row execute function public.file_to_trash();
create trigger period_files_trash after delete on public.period_files for each row execute function public.file_to_trash();
create trigger rkdp_ticket_files_trash after delete on public.rkdp_ticket_files for each row execute function public.file_to_trash();

-- przywrócenie (tylko administrator): wpis wraca na swoje miejsce
create or replace function public.restore_file(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t public.file_trash%rowtype;
begin
  if not public.is_admin() then raise exception 'Tylko administrator może przywracać pliki'; end if;
  select * into t from public.file_trash where id = p_id;
  if not found then raise exception 'Nie ma takiego pliku w koszu'; end if;
  begin
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t.source, t.source) using t.row_data;
  exception when foreign_key_violation then
    raise exception 'Nie można przywrócić – klient lub zadanie, do którego należał plik, zostało usunięte';
  end;
  delete from public.file_trash where id = p_id;
  return t.source;
end $$;
revoke all on function public.restore_file(uuid) from public, anon;
grant execute on function public.restore_file(uuid) to authenticated;

-- czy plik w magazynie jest „chroniony” (podpięty pod wpis albo leży w koszu) – wtedy usunąć go może tylko administrator
create or replace function public.file_protected(p_bucket text, p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.file_trash where bucket = p_bucket and path = p_path)
      or (p_bucket = 'klienci' and exists (select 1 from public.client_files where path = p_path))
      or (p_bucket = 'rozliczenia' and exists (select 1 from public.period_files where path = p_path))
      or (p_bucket = 'zgloszenia' and exists (select 1 from public.rkdp_ticket_files where path = p_path));
$$;
revoke all on function public.file_protected(text, text) from public, anon;
grant execute on function public.file_protected(text, text) to authenticated;

-- autor może sam usunąć tylko „sierotę” (np. plik po nieudanym zapisie wpisu); resztę – administrator
alter policy rozliczenia_delete on storage.objects
  using (bucket_id = 'rozliczenia' and ((select public.is_admin()) or (owner_id = (select auth.uid())::text and not public.file_protected(bucket_id, objects.name))));
alter policy klienci_delete on storage.objects
  using (bucket_id = 'klienci' and ((select public.is_admin()) or (owner_id = (select auth.uid())::text and not public.file_protected(bucket_id, objects.name))));
alter policy zgloszenia_delete on storage.objects
  using (bucket_id = 'zgloszenia' and ((select public.is_admin()) or (owner_id = (select auth.uid())::text and not public.file_protected(bucket_id, objects.name))));

-- codzienne czyszczenie kosza (pliki starsze niż 30 dni) przez funkcję „kosz”
select cron.schedule('kosz-purge', '30 2 * * *', $$ select public.edge_call('kosz', '{"action":"purge"}'::jsonb) $$);
