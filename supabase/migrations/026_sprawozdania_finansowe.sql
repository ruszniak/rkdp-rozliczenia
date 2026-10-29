-- 026: sprawozdania finansowe (e-SF) przygotowywane w aplikacji – dane do wygenerowania pliku XML.
-- Zapisujemy tylko kwoty i teksty sprawozdania (bez pliku JPK – ten zostaje na komputerze użytkownika).
-- Zapisane sprawozdanie za rok N jest danymi porównawczymi przy sprawozdaniu za rok N+1.

create table if not exists public.fin_statements (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  year        int  not null check (year between 2000 and 2100),
  wzor        text not null default 'mikro' check (wzor in ('mikro', 'mala', 'inna')),
  data        jsonb not null,
  status      text not null default 'projekt' check (status in ('projekt', 'gotowe', 'zlozone')),
  updated_by  uuid default public.current_member_id() references public.team_members(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (client_id, year, wzor)
);
alter table public.fin_statements enable row level security;
drop policy if exists fs_select on public.fin_statements;
create policy fs_select on public.fin_statements for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists fs_insert on public.fin_statements;
create policy fs_insert on public.fin_statements for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists fs_update on public.fin_statements;
create policy fs_update on public.fin_statements for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists fs_delete on public.fin_statements;
create policy fs_delete on public.fin_statements for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.fin_statements to authenticated;

create or replace function public.fin_statements_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := coalesce(public.current_member_id(), new.updated_by); return new; end $$;
drop trigger if exists fin_statements_touch on public.fin_statements;
create trigger fin_statements_touch before update on public.fin_statements for each row execute function public.fin_statements_touch();
