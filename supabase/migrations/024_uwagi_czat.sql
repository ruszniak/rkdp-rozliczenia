-- 024: uwagi do klienta w miesiącu jako czat – każda uwaga / pytanie to osobny wpis z autorem i godziną.
-- period_notes zostaje jako podsumowanie (kropka w tabeli, eksporty): notes = uwagi z miesiąca, questions = otwarte pytania.

create table if not exists public.period_comments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  period      date not null check (extract(day from period) = 1),
  kind        text not null default 'uwaga' check (kind in ('uwaga', 'pytanie')),
  body        text not null check (length(btrim(body)) between 1 and 4000),
  author      uuid default public.current_member_id() references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.team_members(id) on delete set null
);
create index if not exists period_comments_idx on public.period_comments (client_id, period, created_at);

alter table public.period_comments enable row level security;
drop policy if exists pc_select on public.period_comments;
create policy pc_select on public.period_comments for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists pc_insert on public.period_comments;
create policy pc_insert on public.period_comments for insert to authenticated
  with check (((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
              and author = (select public.current_member_id()));
-- oznaczenie pytania jako wyjaśnionego – każdy, kto widzi klienta
drop policy if exists pc_update on public.period_comments;
create policy pc_update on public.period_comments for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
-- usunąć wpis może jego autor albo administrator
drop policy if exists pc_delete on public.period_comments;
create policy pc_delete on public.period_comments for delete to authenticated
  using (author = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.period_comments to authenticated;

-- autor i treść nie zmieniają się po wysłaniu (edycja tylko statusu pytania)
create or replace function public.period_comments_guard() returns trigger language plpgsql as $$
begin
  new.client_id := old.client_id; new.period := old.period; new.author := old.author;
  new.created_at := old.created_at; new.body := old.body; new.kind := old.kind;
  if new.resolved_at is not null and old.resolved_at is null then new.resolved_by := public.current_member_id(); end if;
  if new.resolved_at is null then new.resolved_by := null; end if;
  return new;
end $$;
drop trigger if exists period_comments_guard on public.period_comments;
create trigger period_comments_guard before update on public.period_comments for each row execute function public.period_comments_guard();

-- podsumowanie w period_notes
create or replace function public.period_comments_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.client_id, old.client_id); per date := coalesce(new.period, old.period); n text; q text;
begin
  select string_agg(body, E'\n' order by created_at) filter (where kind = 'uwaga'),
         string_agg(body, E'\n' order by created_at) filter (where kind = 'pytanie' and resolved_at is null)
    into n, q from public.period_comments where client_id = cid and period = per;
  insert into public.period_notes (client_id, period, notes, questions) values (cid, per, n, q)
    on conflict (client_id, period) do update set notes = excluded.notes, questions = excluded.questions
    where period_notes.notes is distinct from excluded.notes or period_notes.questions is distinct from excluded.questions;
  return null;
end $$;
revoke execute on function public.period_comments_sync() from public, anon, authenticated;
drop trigger if exists period_comments_sync on public.period_comments;
create trigger period_comments_sync after insert or update or delete on public.period_comments for each row execute function public.period_comments_sync();

-- dotychczasowe uwagi i pytania przenoszone do czatu (autor nieznany → „wcześniej”)
insert into public.period_comments (client_id, period, kind, body, author, created_at)
select client_id, period, 'uwaga', btrim(notes), null, updated_at from public.period_notes
 where coalesce(btrim(notes), '') <> '' and not exists (select 1 from public.period_comments c where c.client_id = period_notes.client_id and c.period = period_notes.period);
insert into public.period_comments (client_id, period, kind, body, author, created_at)
select client_id, period, 'pytanie', btrim(questions), null, updated_at + interval '1 second' from public.period_notes
 where coalesce(btrim(questions), '') <> '' and not exists (select 1 from public.period_comments c where c.client_id = period_notes.client_id and c.period = period_notes.period and c.kind = 'pytanie');

do $$ begin
  alter publication supabase_realtime add table public.period_comments;
exception when duplicate_object then null; end $$;

-- nowy status kratki: „Wysłano przypomnienie” (ustawiany po wysłaniu wiadomości do klienta z aplikacji)
alter table public.checklist_entries drop constraint if exists checklist_entries_status_check;
alter table public.checklist_entries add constraint checklist_entries_status_check
  check (status in ('todo', 'in_progress', 'missing_docs', 'reminded', 'done', 'na'));
alter table public.year_close_entries drop constraint if exists year_close_entries_status_check;
alter table public.year_close_entries add constraint year_close_entries_status_check
  check (status in ('todo', 'in_progress', 'missing_docs', 'reminded', 'done', 'na'));
