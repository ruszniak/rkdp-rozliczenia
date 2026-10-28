-- 022: zamknięcie roku, czas pracy na klientach, prośby o dokumenty (link dla klienta), monitoring klientów,
--      ustawienia osobiste (pulpit, zapisane widoki).

-- ---------- zamknięcie roku (kratki roczne jak w rozliczeniach miesięcznych) ----------
create table if not exists public.year_close_entries (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  year        int  not null check (year between 2020 and 2100),
  task_code   text not null,
  status      text not null default 'todo' check (status in ('todo', 'in_progress', 'missing_docs', 'done', 'na')),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (client_id, year, task_code)
);
create index if not exists year_close_year_idx on public.year_close_entries (year);
alter table public.year_close_entries enable row level security;
drop policy if exists yc_select on public.year_close_entries;
create policy yc_select on public.year_close_entries for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists yc_insert on public.year_close_entries;
create policy yc_insert on public.year_close_entries for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists yc_update on public.year_close_entries;
create policy yc_update on public.year_close_entries for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists yc_delete on public.year_close_entries;
create policy yc_delete on public.year_close_entries for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.year_close_entries to authenticated;

create or replace function public.touch_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_table_name in ('checklist_entries', 'period_notes', 'year_close_entries') then
    new.updated_by := coalesce(nullif(public.current_email(), ''), 'system');
  end if;
  return new;
end $$;
drop trigger if exists touch_year_close on public.year_close_entries;
create trigger touch_year_close before insert or update on public.year_close_entries for each row execute function public.touch_row();

-- ---------- czas pracy na klientach RKDP (do rentowności) ----------
create table if not exists public.client_time (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  member_id   uuid not null default public.current_member_id() references public.team_members(id) on delete cascade,
  work_date   date not null default current_date,
  minutes     int  not null check (minutes between 1 and 1440),
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists client_time_idx on public.client_time (work_date, client_id);
alter table public.client_time enable row level security;
drop policy if exists ct_select on public.client_time;
create policy ct_select on public.client_time for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.has_full_access()));
drop policy if exists ct_insert on public.client_time;
create policy ct_insert on public.client_time for insert to authenticated
  with check (member_id = (select public.current_member_id()) and (select public.can_see_client(client_id)));
drop policy if exists ct_update on public.client_time;
create policy ct_update on public.client_time for update to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()))
  with check (member_id = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists ct_delete on public.client_time;
create policy ct_delete on public.client_time for delete to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.client_time to authenticated;

-- ---------- prośby o dokumenty: link dla klienta do wgrania plików bez logowania ----------
create table if not exists public.doc_requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  period        date not null,
  token         text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  items         jsonb not null default '[]',
  message       text,
  email         text,
  created_by    uuid default public.current_member_id() references public.team_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  sent_at       timestamptz,
  sent_via      text,
  reminded_at   timestamptz,
  last_upload_at timestamptz,
  files_count   int not null default 0,
  closed_at     timestamptz
);
create index if not exists doc_requests_client_idx on public.doc_requests (client_id, period);
alter table public.doc_requests enable row level security;
drop policy if exists dr_select on public.doc_requests;
create policy dr_select on public.doc_requests for select to authenticated using ((select public.can_see_client(client_id)));
drop policy if exists dr_insert on public.doc_requests;
create policy dr_insert on public.doc_requests for insert to authenticated
  with check ((select public.can_see_client(client_id)) and (select public.has_module('rozliczenia')));
drop policy if exists dr_update on public.doc_requests;
create policy dr_update on public.doc_requests for update to authenticated
  using ((select public.can_see_client(client_id))) with check ((select public.can_see_client(client_id)));
grant select, insert, update on public.doc_requests to authenticated;

-- pliki wgrane przez klienta: bez autora z zespołu, oznaczone źródłem i prośbą
alter table public.period_files add column if not exists source text not null default 'zespol';
alter table public.period_files add column if not exists request_id uuid references public.doc_requests(id) on delete set null;
drop policy if exists period_files_delete on public.period_files;
create policy period_files_delete on public.period_files for delete to authenticated
  using (uploaded_by = (select public.current_member_id()) or (select public.is_admin())
    or (source = 'klient' and (select public.can_see_client(client_id))));

-- ---------- monitoring klientów: Biała lista VAT i KRS ----------
create table if not exists public.client_monitor (
  id           uuid primary key default gen_random_uuid(),
  module       text not null check (module in ('rkdp', 'm2')),
  client_id    uuid references public.clients(id) on delete cascade,
  m2_client_id uuid references public.m2_clients(id) on delete cascade,
  nip          text,
  snapshot     jsonb not null default '{}',
  checked_at   timestamptz not null default now()
);
create unique index if not exists client_monitor_rkdp on public.client_monitor (client_id) where module = 'rkdp';
create unique index if not exists client_monitor_m2 on public.client_monitor (m2_client_id) where module = 'm2';
alter table public.client_monitor enable row level security;
drop policy if exists cm_select on public.client_monitor;
create policy cm_select on public.client_monitor for select to authenticated
  using ((module = 'rkdp' and (select public.can_see_client(client_id))) or (module = 'm2' and (select public.has_module('doradztwo'))));
grant select on public.client_monitor to authenticated;

create table if not exists public.monitor_alerts (
  id           uuid primary key default gen_random_uuid(),
  module       text not null check (module in ('rkdp', 'm2')),
  client_id    uuid references public.clients(id) on delete cascade,
  m2_client_id uuid references public.m2_clients(id) on delete cascade,
  kind         text not null,
  severity     text not null default 'uwaga' check (severity in ('uwaga', 'info')),
  summary      text not null,
  details      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.team_members(id) on delete set null
);
create index if not exists monitor_alerts_open on public.monitor_alerts (created_at desc) where resolved_at is null;
alter table public.monitor_alerts enable row level security;
drop policy if exists ma_select on public.monitor_alerts;
create policy ma_select on public.monitor_alerts for select to authenticated
  using ((module = 'rkdp' and (select public.can_see_client(client_id))) or (module = 'm2' and (select public.has_module('doradztwo'))));
drop policy if exists ma_update on public.monitor_alerts;
create policy ma_update on public.monitor_alerts for update to authenticated
  using ((module = 'rkdp' and (select public.can_see_client(client_id))) or (module = 'm2' and (select public.has_module('doradztwo'))))
  with check ((module = 'rkdp' and (select public.can_see_client(client_id))) or (module = 'm2' and (select public.has_module('doradztwo'))));
grant select, update on public.monitor_alerts to authenticated;

-- ---------- ustawienia osobiste (układ pulpitu, zapisane widoki) – wspólne dla wszystkich urządzeń ----------
create table if not exists public.member_prefs (
  member_id  uuid primary key references public.team_members(id) on delete cascade,
  prefs      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.member_prefs enable row level security;
drop policy if exists mp_own on public.member_prefs;
create policy mp_own on public.member_prefs for all to authenticated
  using (member_id = (select public.current_member_id())) with check (member_id = (select public.current_member_id()));
grant select, insert, update on public.member_prefs to authenticated;

-- ---------- wywołania funkcji brzegowych z bazy (harmonogram) ----------
create or replace function public.edge_call(p_fn text, p_body jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare s text;
begin
  if p_fn !~ '^[a-z0-9-]+$' then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_hook_secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://iuszfoyttqnkzjzjpzma.supabase.co/functions/v1/' || p_fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
    body := p_body, timeout_milliseconds := 60000);
exception when others then null;
end $$;
revoke all on function public.edge_call(text, jsonb) from public, anon, authenticated;

-- monitoring co tydzień (poniedziałek 5:40 UTC), przypomnienia o dokumentach w dni robocze (7:05 UTC)
select cron.unschedule(jobid) from cron.job where jobname in ('monitor-weekly', 'docs-remind');
select cron.schedule('monitor-weekly', '40 5 * * 1', $$ select public.edge_call('monitor', '{"action":"run_all"}'::jsonb) $$);
select cron.schedule('docs-remind', '5 7 * * 1-5', $$ select public.edge_call('docs', '{"action":"remind"}'::jsonb) $$);

-- adres nadawcy e-maili do klientów (konto Google Workspace z delegacją dla konta usługi); pusty = wysyłka z programu pocztowego
insert into public.app_settings (key, value) values ('mail_sender', '') on conflict (key) do nothing;
