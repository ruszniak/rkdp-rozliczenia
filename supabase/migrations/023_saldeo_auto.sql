-- =====================================================================
-- 023: automatyczne kratki z SaldeoSMART (tylko odczyt z Saldeo)
--   • kratka „Saldeo”  – klient zatwierdził w miesiącu co najmniej jedną fakturę z KSeF
--                        („komplet dokumentów” nie jest udostępniany przez API Saldeo – tę część zaznacza się ręcznie)
--   • kratka „Rewizor” – wszystkie faktury miesiąca są przeniesione do programu księgowego (e-bit)
-- Automat zaznacza wyłącznie kratki w stanie „do zrobienia” i nigdy niczego nie odznacza.
-- Gdy ktoś z zespołu odznaczy kratkę zaznaczoną automatycznie, automat nie wraca już do niej w tym miesiącu.
-- =====================================================================

-- powiązanie klienta z firmą w SaldeoSMART (dopasowywane po NIP, administrator może poprawić)
alter table public.clients add column if not exists saldeo_company_id text;
create unique index if not exists clients_saldeo_company_uq on public.clients (saldeo_company_id) where saldeo_company_id is not null;

-- znacznik automatu przy kratce
alter table public.checklist_entries
  add column if not exists auto_source  text,                       -- 'saldeo' gdy kratkę zaznaczył automat
  add column if not exists auto_at      timestamptz,
  add column if not exists auto_detail  jsonb,                      -- skąd decyzja (liczba faktur, z KSeF, zatwierdzone, przeniesione)
  add column if not exists auto_blocked boolean not null default false; -- osoba odznaczyła – automat nie rusza

-- touch_row: wpis automatu podpisany jako „auto:…”, zmiana przez osobę kasuje znacznik automatu
create or replace function public.touch_row()
returns trigger language plpgsql set search_path = public as $$
declare me text := nullif(public.current_email(), '');
begin
  new.updated_at := now();
  if tg_table_name in ('checklist_entries', 'period_notes', 'year_close_entries') then
    if me is null and tg_table_name = 'checklist_entries' and coalesce(new.updated_by, '') like 'auto:%'
       and (tg_op = 'INSERT' or new.updated_by is distinct from old.updated_by or new.auto_at is distinct from old.auto_at) then
      null; -- zapis automatu (service_role) – zostaje podpis „auto:saldeo”
    else
      new.updated_by := coalesce(me, 'system');
    end if;
  end if;
  -- kolumny automatu zmienia tylko automat (service_role); osoba z zespołu ich nie ustawi
  if tg_table_name = 'checklist_entries' and me is not null then
    if tg_op = 'INSERT' then
      new.auto_source := null; new.auto_at := null; new.auto_detail := null; new.auto_blocked := false;
    else
      new.auto_source := old.auto_source; new.auto_at := old.auto_at;
      new.auto_detail := old.auto_detail; new.auto_blocked := old.auto_blocked;
      if old.auto_source is not null and new.status is distinct from old.status then
        new.auto_blocked := old.auto_blocked or old.status = 'done';
        new.auto_source := null; new.auto_at := null; new.auto_detail := null;
      end if;
    end if;
  end if;
  return new;
end $$;

-- dziennik przebiegów integracji (widoczny w „Zespół i ustawienia”)
create table if not exists public.integration_runs (
  id          bigserial primary key,
  source      text not null,                 -- 'saldeo'
  trigger     text not null,                 -- 'harmonogram' | 'ręcznie'
  period      date,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  companies   int,
  ticked      int,
  errors      jsonb not null default '[]',
  run_by      text
);
create index if not exists integration_runs_idx on public.integration_runs (source, started_at desc);
alter table public.integration_runs enable row level security;
drop policy if exists ir_select on public.integration_runs;
create policy ir_select on public.integration_runs for select to authenticated using ((select public.has_full_access()));
grant select on public.integration_runs to authenticated;

-- ostatnie sprawdzenie klienta w Saldeo (podsumowanie do podpowiedzi i kolejności sprawdzania)
create table if not exists public.saldeo_checks (
  client_id  uuid not null references public.clients(id) on delete cascade,
  period     date not null check (extract(day from period) = 1),
  checked_at timestamptz not null default now(),
  summary    jsonb not null default '{}',
  error      text,
  primary key (client_id, period)
);
alter table public.saldeo_checks enable row level security;
drop policy if exists sc_select on public.saldeo_checks;
create policy sc_select on public.saldeo_checks for select to authenticated using ((select public.can_see_client(client_id)));
grant select on public.saldeo_checks to authenticated;

-- nazwy etapów obiegu w Saldeo, które oznaczają zatwierdzenie dokumentu przez klienta (oddzielone przecinkami)
insert into public.app_settings (key, value) values ('saldeo_approved_stages', 'Zatwierdzony') on conflict (key) do nothing;

-- harmonogram: dni robocze co 10 minut między 6:00 a 16:59 UTC; każde wywołanie sprawdza kilka firm
-- (limit Saldeo: 20 zapytań na minutę i jedno naraz), najpierw te sprawdzane najdawniej
select cron.unschedule(jobid) from cron.job where jobname = 'saldeo-sync';
select cron.schedule('saldeo-sync', '*/10 6-16 * * 1-5', $$ select public.edge_call('saldeo', '{"action":"run_all"}'::jsonb) $$);
