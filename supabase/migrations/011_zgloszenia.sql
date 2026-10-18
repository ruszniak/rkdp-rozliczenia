-- 011: RKDP – rejestr zgłoszeń / zadań (CRM): zgłoszenie, termin, opis, odpowiedzialny, status, komentarze i historia.
create table if not exists public.rkdp_tickets (
  id           uuid primary key default gen_random_uuid(),
  no           bigint generated always as identity,
  title        text not null check (length(trim(title)) > 0),
  description  text,
  client_id    uuid references public.clients(id) on delete set null,
  category     text not null default 'inne',
  priority     text not null default 'normalny' check (priority in ('niski','normalny','wysoki','pilny')),
  status       text not null default 'nowe' check (status in ('nowe','w_toku','czeka','zrobione','anulowane')),
  source       text,
  due_date     date,
  assignee_id  uuid references public.team_members(id) on delete set null,
  created_by   uuid references public.team_members(id) on delete set null default public.current_member_id(),
  done_at      timestamptz,
  done_by      uuid references public.team_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rkdp_tickets_open_idx on public.rkdp_tickets (status, due_date);
create index if not exists rkdp_tickets_client_idx on public.rkdp_tickets (client_id);
create index if not exists rkdp_tickets_assignee_idx on public.rkdp_tickets (assignee_id);

create table if not exists public.rkdp_ticket_comments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.rkdp_tickets(id) on delete cascade,
  author_id  uuid references public.team_members(id) on delete set null default public.current_member_id(),
  kind       text not null default 'komentarz' check (kind in ('komentarz','zmiana','wykonanie')),
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists rkdp_ticket_comments_ticket_idx on public.rkdp_ticket_comments (ticket_id, created_at);

-- kto widzi zgłoszenie: pełny dostęp, zgłaszający, odpowiedzialny albo ktoś, kto widzi klienta
create or replace function public.can_see_ticket(t public.rkdp_tickets) returns boolean
language sql stable set search_path = public as $$
  select public.has_module('rozliczenia') and (
    public.has_full_access()
    or t.created_by = public.current_member_id()
    or t.assignee_id = public.current_member_id()
    or (t.client_id is not null and t.client_id in (select public.visible_client_ids())))
$$;

alter table public.rkdp_tickets enable row level security;
alter table public.rkdp_ticket_comments enable row level security;

drop policy if exists rkdp_tickets_select on public.rkdp_tickets;
create policy rkdp_tickets_select on public.rkdp_tickets for select to authenticated using (public.can_see_ticket(rkdp_tickets));
drop policy if exists rkdp_tickets_insert on public.rkdp_tickets;
create policy rkdp_tickets_insert on public.rkdp_tickets for insert to authenticated
  with check ((select public.has_module('rozliczenia')) and created_by = (select public.current_member_id()));
drop policy if exists rkdp_tickets_update on public.rkdp_tickets;
create policy rkdp_tickets_update on public.rkdp_tickets for update to authenticated
  using (public.can_see_ticket(rkdp_tickets)) with check (public.can_see_ticket(rkdp_tickets));
drop policy if exists rkdp_tickets_delete on public.rkdp_tickets;
create policy rkdp_tickets_delete on public.rkdp_tickets for delete to authenticated using ((select public.is_admin()));

drop policy if exists rkdp_ticket_comments_select on public.rkdp_ticket_comments;
create policy rkdp_ticket_comments_select on public.rkdp_ticket_comments for select to authenticated
  using (exists (select 1 from public.rkdp_tickets t where t.id = ticket_id));
drop policy if exists rkdp_ticket_comments_insert on public.rkdp_ticket_comments;
create policy rkdp_ticket_comments_insert on public.rkdp_ticket_comments for insert to authenticated
  with check (author_id = (select public.current_member_id()) and exists (select 1 from public.rkdp_tickets t where t.id = ticket_id));
drop policy if exists rkdp_ticket_comments_delete on public.rkdp_ticket_comments;
create policy rkdp_ticket_comments_delete on public.rkdp_ticket_comments for delete to authenticated
  using (kind = 'komentarz' and (author_id = (select public.current_member_id()) or (select public.is_admin())));

grant select, insert, update, delete on public.rkdp_tickets, public.rkdp_ticket_comments to authenticated;
revoke execute on function public.can_see_ticket(public.rkdp_tickets) from public, anon;
grant execute on function public.can_see_ticket(public.rkdp_tickets) to authenticated;

-- updated_at, data i autor wykonania, historia zmian (status, termin, odpowiedzialny, priorytet) w komentarzach
create or replace function public.rkdp_ticket_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_member_id();
  st constant jsonb := '{"nowe":"nowe","w_toku":"w toku","czeka":"czeka na klienta","zrobione":"zrobione","anulowane":"anulowane"}';
  msg text[] := '{}';
begin
  new.updated_at := now();
  if new.status = 'zrobione' and old.status is distinct from 'zrobione' then new.done_at := now(); new.done_by := me;
  elsif new.status <> 'zrobione' then new.done_at := null; new.done_by := null; end if;
  if new.status is distinct from old.status then msg := msg || format('status: %s → %s', st->>old.status, st->>new.status); end if;
  if new.due_date is distinct from old.due_date then msg := msg || format('termin: %s → %s', coalesce(to_char(old.due_date,'DD.MM.YYYY'),'brak'), coalesce(to_char(new.due_date,'DD.MM.YYYY'),'brak')); end if;
  if new.assignee_id is distinct from old.assignee_id then
    msg := msg || format('odpowiedzialny: %s → %s',
      coalesce((select full_name from team_members where id = old.assignee_id),'nikt'),
      coalesce((select full_name from team_members where id = new.assignee_id),'nikt'));
  end if;
  if new.priority is distinct from old.priority then msg := msg || format('priorytet: %s → %s', old.priority, new.priority); end if;
  if array_length(msg, 1) > 0 then
    insert into rkdp_ticket_comments(ticket_id, author_id, kind, body) values (new.id, me, 'zmiana', array_to_string(msg, '; '));
  end if;
  return new;
end $$;
revoke execute on function public.rkdp_ticket_track() from public, anon;
drop trigger if exists rkdp_tickets_track on public.rkdp_tickets;
create trigger rkdp_tickets_track before update on public.rkdp_tickets for each row execute function public.rkdp_ticket_track();

create or replace function public.rkdp_ticket_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'zrobione' then new.done_at := now(); new.done_by := new.created_by; end if;
  return new;
end $$;
revoke execute on function public.rkdp_ticket_created() from public, anon;
drop trigger if exists rkdp_tickets_created on public.rkdp_tickets;
create trigger rkdp_tickets_created before insert on public.rkdp_tickets for each row execute function public.rkdp_ticket_created();
