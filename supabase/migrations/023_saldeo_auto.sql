-- =====================================================================
-- 023: automatyczne kratki z SaldeoSMART (tylko odczyt z Saldeo)
--   • kratka „Saldeo”  – klient zatwierdził w miesiącu co najmniej jedną fakturę z KSeF
--                        albo zaznaczył „komplet dokumentów”
--   • kratka „Rewizor” – wszystkie dokumenty miesiąca są przeniesione do programu księgowego (e-bit)
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
  add column if not exists auto_detail  jsonb,                      -- skąd decyzja (np. liczba faktur KSeF, komplet, przeniesione)
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

-- harmonogram: dni robocze 6:20, 10:20, 14:20 UTC (7:20 / 11:20 / 15:20 czasu zimowego)
select cron.unschedule(jobid) from cron.job where jobname = 'saldeo-sync';
select cron.schedule('saldeo-sync', '20 6,10,14 * * 1-5', $$ select public.edge_call('saldeo', '{"action":"run_all"}'::jsonb) $$);
