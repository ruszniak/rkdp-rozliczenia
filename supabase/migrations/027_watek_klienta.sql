-- 027: wątek klienta – uwagi, pytania i zadania (zgłoszenia) w jednej rozmowie o kliencie, z historią.
--  • period_comments: odpowiedzi (parent_id), przypięte ustalenia (pinned), wzmianki (@), edycja z historią, usuwanie ze śladem
--  • rkdp_tickets.period – miesiąc rozliczeniowy, którego dotyczy zadanie (zadania z wątku i z zakładki Zgłoszenia)
--  • thread_reads – kiedy kto ostatnio czytał wątek klienta (licznik „Nieprzeczytane”)

alter table public.period_comments
  add column if not exists parent_id   uuid references public.period_comments(id) on delete cascade,
  add column if not exists pinned      boolean not null default false,
  add column if not exists mentions    uuid[] not null default '{}',
  add column if not exists edited_at   timestamptz,
  add column if not exists history     jsonb not null default '[]',
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.team_members(id) on delete set null;
create index if not exists period_comments_client_idx on public.period_comments (client_id, created_at desc);
create index if not exists period_comments_pinned_idx on public.period_comments (client_id) where pinned and deleted_at is null;

-- wpisów nie usuwa się fizycznie (poza administratorem) – „usunięcie” zostawia ślad
drop policy if exists pc_delete on public.period_comments;
create policy pc_delete on public.period_comments for delete to authenticated using ((select public.is_admin()));

-- zmiany: treść tylko autor (poprzednia wersja trafia do historii), usunięcie – autor albo administrator,
-- rozwiązanie pytania i przypięcie – każdy, kto widzi klienta
create or replace function public.period_comments_guard() returns trigger language plpgsql as $$
declare me uuid := public.current_member_id();
begin
  new.client_id := old.client_id; new.period := old.period; new.author := old.author; new.parent_id := old.parent_id;
  new.created_at := old.created_at; new.kind := old.kind;
  if new.body is distinct from old.body then
    if old.author is distinct from me or old.deleted_at is not null then new.body := old.body; new.mentions := old.mentions;
    else
      new.history := old.history || jsonb_build_array(jsonb_build_object('body', old.body, 'at', coalesce(old.edited_at, old.created_at)));
      new.edited_at := now();
    end if;
  else new.history := old.history; new.edited_at := old.edited_at;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    if old.author is distinct from me and not public.is_admin() then new.deleted_at := null;
    else new.deleted_by := me; new.pinned := false; end if;
  elsif new.deleted_at is null and old.deleted_at is not null then
    if not public.is_admin() then new.deleted_at := old.deleted_at; else new.deleted_by := null; end if;
  else new.deleted_by := old.deleted_by;
  end if;
  if new.resolved_at is not null and old.resolved_at is null then new.resolved_by := me; end if;
  if new.resolved_at is null then new.resolved_by := null; end if;
  return new;
end $$;

-- podsumowanie w period_notes bez usuniętych wpisów i bez odpowiedzi
create or replace function public.period_comments_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.client_id, old.client_id); per date := coalesce(new.period, old.period); n text; q text;
begin
  select string_agg(body, E'\n' order by created_at) filter (where kind = 'uwaga'),
         string_agg(body, E'\n' order by created_at) filter (where kind = 'pytanie' and resolved_at is null)
    into n, q from public.period_comments where client_id = cid and period = per and deleted_at is null and parent_id is null;
  insert into public.period_notes (client_id, period, notes, questions) values (cid, per, n, q)
    on conflict (client_id, period) do update set notes = excluded.notes, questions = excluded.questions
    where period_notes.notes is distinct from excluded.notes or period_notes.questions is distinct from excluded.questions;
  return null;
end $$;

-- zadania: miesiąc rozliczeniowy, którego dotyczą
alter table public.rkdp_tickets add column if not exists period date check (period is null or extract(day from period) = 1);
create index if not exists rkdp_tickets_client_period_idx on public.rkdp_tickets (client_id, period);

-- odczyty wątków
create table if not exists public.thread_reads (
  member_id uuid not null references public.team_members(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (member_id, client_id)
);
alter table public.thread_reads enable row level security;
drop policy if exists tr_own on public.thread_reads;
create policy tr_own on public.thread_reads for all to authenticated
  using (member_id = (select public.current_member_id())) with check (member_id = (select public.current_member_id()));
grant select, insert, update, delete on public.thread_reads to authenticated;

-- nieprzeczytane wątki: klienci, u których ktoś inny napisał (wpis, odpowiedź, komentarz do zadania) po moim ostatnim odczycie.
-- Liczymy tylko klientów, przy których jestem księgową / kadrową, oraz wątki, w których mnie oznaczono.
create or replace function public.unread_threads()
returns table (client_id uuid, name text, n int, last_at timestamptz, mentioned boolean, period date)
language sql stable security invoker set search_path = public as $$
  with me as (select public.current_member_id() id),
  ev as (
    select c.client_id, c.created_at at, c.period, (select id from me) = any(c.mentions) m
      from period_comments c where c.deleted_at is null and c.author is distinct from (select id from me)
        and c.created_at > now() - interval '60 days'
    union all
    select t.client_id, k.created_at, coalesce(t.period, date_trunc('month', t.created_at)::date), false
      from rkdp_ticket_comments k join rkdp_tickets t on t.id = k.ticket_id
     where t.client_id is not null and k.kind <> 'zmiana' and k.author_id is distinct from (select id from me)
       and k.created_at > now() - interval '60 days'
  )
  select e.client_id, cl.name, count(*)::int, max(e.at), bool_or(e.m), (array_agg(e.period order by e.at desc))[1]
    from ev e join clients cl on cl.id = e.client_id
    left join thread_reads r on r.client_id = e.client_id and r.member_id = (select id from me)
   where e.at > coalesce(r.read_at, now() - interval '14 days')
     and (e.m or cl.accountant_id = (select id from me) or cl.hr_id = (select id from me))
   group by e.client_id, cl.name
   order by max(e.at) desc
   limit 50
$$;
grant execute on function public.unread_threads() to authenticated;

-- powiadomienie o wzmiance (@Imię)
create or replace function public.push_on_mention()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(new.mentions, 1), 0) > 0 and (tg_op = 'INSERT' or new.mentions is distinct from old.mentions) then
    perform public.push_call(jsonb_build_object('event', 'mention', 'id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists push_mention on public.period_comments;
create trigger push_mention after insert or update of mentions on public.period_comments for each row execute function public.push_on_mention();
