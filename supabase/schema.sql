-- =====================================================================
-- RKDP · Rozliczenia — schemat bazy danych (Supabase / PostgreSQL)
-- Uruchom w Supabase: SQL Editor → New query → wklej całość → Run.
-- Skrypt można uruchomić tylko raz na pustym projekcie.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ZESPÓŁ
-- role: admin   – wszystko, w tym zespół i przypisania
--       full    – widzi i edytuje wszystkich klientów
--       limited – widzi tylko klientów przypisanych do siebie
-- ---------------------------------------------------------------------
create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email = lower(email)),
  full_name   text not null,
  short_name  text not null,
  role        text not null default 'limited' check (role in ('admin','full','limited')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- KLIENCI
-- ---------------------------------------------------------------------
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  status            text not null default 'aktywny'
                    check (status in ('aktywny','zawieszony','zakonczony')),
  legal_form        text check (legal_form in ('jdg','spolka_cywilna','spolka_jawna','spolka_partnerska',
                                               'spolka_komandytowa','spzoo','spolka_akcyjna',
                                               'fundacja_stowarzyszenie','wspolnota','inna')),
  bookkeeping       text check (bookkeeping in ('kpir','ryczalt','pelna')),

  -- dane i kontakt
  nip               text,
  regon             text,
  krs               text,
  address           text,
  contact_person    text,
  email             text,
  phone             text,
  docs_channel      text,               -- np. Saldeo, e-mail, papier

  -- PIT (JDG)
  pit_form          text check (pit_form in ('skala','liniowy','ryczalt','karta')),
  ryczalt_rates     text,               -- np. "3% handel, 8,5% najem"
  pit_advances      text check (pit_advances in ('miesieczne','kwartalne','uproszczone')),

  -- ZUS (JDG – właściciel)
  zus_type          text check (zus_type in ('ulga_na_start','preferencyjny','maly_zus_plus','pelny',
                                             'zbieg_etat','emeryt_rencista','tylko_zdrowotna','brak')),
  zus_sickness      boolean,            -- dobrowolne chorobowe
  has_employees     boolean,            -- pracownicy / zleceniobiorcy → lista płac, DRA
  employees_count   integer,
  ppk               boolean,

  -- CIT (spółki kapitałowe)
  cit_type          text check (cit_type in ('estonski','zwykly_19','maly_podatnik_9')),
  cit_advances      text check (cit_advances in ('miesieczne','kwartalne','uproszczone','brak')),
  fiscal_year       text,               -- np. "kalendarzowy" albo "01.07–30.06"

  -- VAT
  vat_status        text check (vat_status in ('czynny_miesieczny','czynny_kwartalny','zwolniony_podmiotowo',
                                               'zwolniony_przedmiotowo','niezarejestrowany')),
  vat_ue            boolean,            -- transakcje WDT/WNT/import usług → VAT-UE
  cash_register     boolean,            -- kasa fiskalna
  ksef_access       boolean,            -- biuro ma uprawnienia w KSeF

  -- formalności
  contract_signed   boolean,
  contract_date     date,
  monthly_fee       numeric(10,2),      -- wynagrodzenie biura netto / mies.
  upl1              boolean,            -- pełnomocnictwo UPL-1 (US)
  zus_pel           boolean,            -- pełnomocnictwo ZUS PEL
  crbr_reported     boolean,            -- zgłoszenie do CRBR (spółki)

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index clients_name_idx on public.clients (name);

-- Wspólnicy spółek osobowych (rozliczenie PIT i ZUS wspólników)
create table public.client_partners (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  full_name      text not null,
  email          text,
  phone          text,
  share_percent  numeric(5,2),
  settled_by_us  boolean not null default true,   -- PIT/ZUS wspólnika prowadzimy my
  pit_form       text check (pit_form in ('skala','liniowy','ryczalt')),
  pit_advances   text check (pit_advances in ('miesieczne','kwartalne','uproszczone')),
  zus_type       text check (zus_type in ('ulga_na_start','preferencyjny','maly_zus_plus','pelny',
                                          'zbieg_etat','emeryt_rencista','tylko_zdrowotna','brak')),
  notes          text,
  created_at     timestamptz not null default now()
);
create index client_partners_client_idx on public.client_partners (client_id);

-- Kto obsługuje klienta (dla ról "limited" decyduje o dostępie)
create table public.client_assignments (
  client_id  uuid not null references public.clients(id) on delete cascade,
  member_id  uuid not null references public.team_members(id) on delete cascade,
  primary key (client_id, member_id)
);
create index client_assignments_member_idx on public.client_assignments (member_id);

-- ---------------------------------------------------------------------
-- ROZLICZENIA MIESIĘCZNE
-- ---------------------------------------------------------------------
-- Kolumny listy kontrolnej (jak w Excelu). rule decyduje, kiedy zadanie
-- automatycznie dostaje „nie dotyczy” przy otwieraniu nowego miesiąca.
create table public.task_types (
  code     text primary key,
  label    text not null,
  sort     integer not null,
  rule     text not null default 'always'
           check (rule in ('always','payroll','zus','income_tax','vat_return','jpk')),
  active   boolean not null default true
);

insert into public.task_types (code, label, sort, rule) values
  ('ksiegowanie', 'Saldeo + Rewizor', 10, 'always'),
  ('lista_plac',  'Lista płac',       20, 'payroll'),
  ('zus_podany',  'ZUS – podany',     30, 'zus'),
  ('zus_wyslany', 'ZUS – wysłany',    40, 'zus'),
  ('saldeo',      'SALDEO',           50, 'always'),
  ('pit_cit',     'PIT/CIT – podany', 60, 'income_tax'),
  ('vat',         'VAT – podany',     70, 'vat_return'),
  ('jpk',         'JPK – wysłany',    80, 'jpk'),
  ('wb',          'WB',               90, 'always');

-- period = pierwszy dzień rozliczanego miesiąca (np. 2026-09-01 = wrzesień 2026)
create table public.checklist_entries (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  period       date not null check (extract(day from period) = 1),
  task_code    text not null references public.task_types(code) on update cascade,
  status       text not null default 'todo'
               check (status in ('todo','in_progress','missing_docs','done','na')),
  assignee_id  uuid references public.team_members(id) on delete set null,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  unique (client_id, period, task_code)
);
create index checklist_period_idx on public.checklist_entries (period);

-- Uwagi i pytania na dany miesiąc (kolumny „Uwagi” i dopiski z Excela)
create table public.period_notes (
  client_id   uuid not null references public.clients(id) on delete cascade,
  period      date not null check (extract(day from period) = 1),
  notes       text,
  questions   text,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (client_id, period)
);

-- Historia zmian (zapisywana automatycznie przez wyzwalacze)
create table public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       text,
  table_name  text not null,
  client_id   uuid,
  period      date,
  action      text not null,
  detail      jsonb
);
create index audit_client_idx on public.audit_log (client_id, at desc);

-- ---------------------------------------------------------------------
-- FUNKCJE POMOCNICZE (uprawnienia)
-- ---------------------------------------------------------------------
create or replace function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.team_members where email = public.current_email() and active
$$;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from public.team_members where email = public.current_email() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() = 'admin', false) $$;

create or replace function public.has_full_access() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() in ('admin','full'), false) $$;

create or replace function public.can_see_client(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_full_access()
      or exists (select 1 from public.client_assignments a
                 where a.client_id = cid and a.member_id = public.current_member_id())
$$;

-- Logowanie tylko dla adresów z listy zespołu: Supabase nie utworzy konta
-- (i nie wyśle kodu) dla adresu spoza tabeli team_members.
create or replace function public.guard_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_members
                 where email = lower(new.email) and active) then
    raise exception 'Adres % nie ma dostępu do aplikacji', new.email;
  end if;
  return new;
end $$;

create trigger guard_new_auth_user
  before insert on auth.users
  for each row execute function public.guard_new_auth_user();

-- ---------------------------------------------------------------------
-- WYZWALACZE: updated_at + historia zmian
-- ---------------------------------------------------------------------
create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name in ('checklist_entries','period_notes') then
    new.updated_by := coalesce(nullif(public.current_email(), ''), 'system');
  end if;
  return new;
end $$;

create trigger touch_clients before update on public.clients
  for each row execute function public.touch_row();
create trigger touch_checklist before insert or update on public.checklist_entries
  for each row execute function public.touch_row();
create trigger touch_notes before insert or update on public.period_notes
  for each row execute function public.touch_row();

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r      jsonb := to_jsonb(coalesce(new, old));
  o      jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n      jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  diff   jsonb := '{}'::jsonb;
  k      text;
  cid    uuid;
begin
  cid := case when tg_table_name = 'clients' then (r ->> 'id')::uuid else (r ->> 'client_id')::uuid end;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at','updated_by') and (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('z', o -> k, 'na', n -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    diff := n;
  else
    diff := o;
  end if;

  if tg_table_name = 'checklist_entries' then
    diff := diff || jsonb_build_object('task_code', r ->> 'task_code');
  end if;

  insert into public.audit_log (actor, table_name, client_id, period, action, detail)
  values (coalesce(nullif(public.current_email(), ''), 'system'), tg_table_name, cid,
          case when r ? 'period' then (r ->> 'period')::date end,
          lower(tg_op), diff);
  return coalesce(new, old);
end $$;

create trigger audit_clients after insert or update or delete on public.clients
  for each row execute function public.write_audit();
create trigger audit_checklist after update or delete on public.checklist_entries
  for each row execute function public.write_audit();
create trigger audit_notes after insert or update on public.period_notes
  for each row execute function public.write_audit();
create trigger audit_partners after insert or update or delete on public.client_partners
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------
-- OTWIERANIE MIESIĄCA
-- Tworzy brakujące pozycje listy kontrolnej dla aktywnych klientów.
-- Istniejących pozycji nie zmienia. „Nie dotyczy” wynika z profilu klienta;
-- gdy profil nie jest uzupełniony, przejmuje stan z poprzedniego miesiąca.
-- ---------------------------------------------------------------------
create or replace function public.generate_period(p_period date) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  per      date := date_trunc('month', p_period)::date;
  prev     date := (date_trunc('month', p_period) - interval '1 month')::date;
  q_end    boolean := extract(month from p_period)::int in (3,6,9,12);
  c        public.clients%rowtype;
  t        public.task_types%rowtype;
  st       text;      -- 'todo' | 'na' | null (= nie wiadomo → z poprzedniego miesiąca)
  prev_st  text;
  prev_as  uuid;
  is_company   boolean;
  is_partner   boolean;
  p_any        boolean;
  p_zus        boolean;
  p_monthly    boolean;
  inserted     integer := 0;
  n            integer;
begin
  if public.current_member_id() is null then
    raise exception 'Brak dostępu';
  end if;

  for c in select * from public.clients where status = 'aktywny' loop
    is_company := c.legal_form in ('spzoo','spolka_akcyjna');
    is_partner := c.legal_form in ('spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa');
    select count(*) > 0,
           coalesce(bool_or(zus_type is distinct from 'brak'), false),
           coalesce(bool_or(coalesce(pit_advances,'miesieczne') <> 'kwartalne'), false)
      into p_any, p_zus, p_monthly
      from public.client_partners where client_id = c.id and settled_by_us;

    for t in select * from public.task_types where active order by sort loop
      st := null;
      case t.rule
        when 'always' then st := 'todo';
        when 'payroll' then
          st := case when c.has_employees is null then null when c.has_employees then 'todo' else 'na' end;
        when 'zus' then
          if c.has_employees then st := 'todo';
          elsif c.legal_form = 'jdg' then
            st := case when c.zus_type is null then null when c.zus_type = 'brak' then 'na' else 'todo' end;
          elsif is_partner and p_any then
            st := case when p_zus then 'todo' when c.has_employees = false then 'na' end;
          elsif c.has_employees = false and c.legal_form is not null then st := 'na';
          end if;
        when 'income_tax' then
          if c.legal_form = 'jdg' then
            if c.pit_form is not null then
              st := case when c.pit_advances = 'kwartalne' and not q_end then 'na' else 'todo' end;
            end if;
          elsif is_partner and p_any then
            st := case when p_monthly or q_end then 'todo' else 'na' end;
          elsif is_company and c.cit_type is not null then
            st := case
                    when c.cit_type = 'estonski' or c.cit_advances = 'brak' then 'na'
                    when c.cit_advances = 'kwartalne' and not q_end then 'na'
                    else 'todo' end;
          end if;
        when 'vat_return' then
          st := case
                  when c.vat_status is null then null
                  when c.vat_status = 'czynny_miesieczny' then 'todo'
                  when c.vat_status = 'czynny_kwartalny' then case when q_end then 'todo' else 'na' end
                  else 'na' end;
        when 'jpk' then
          st := case
                  when c.vat_status is null then null
                  when c.vat_status like 'czynny%' then 'todo'
                  else 'na' end;
      end case;

      select e.status, e.assignee_id into prev_st, prev_as
        from public.checklist_entries e
       where e.client_id = c.id and e.period = prev and e.task_code = t.code;

      if st is null then
        st := case when prev_st = 'na' then 'na' else 'todo' end;
      end if;

      insert into public.checklist_entries (client_id, period, task_code, status, assignee_id)
      values (c.id, per, t.code, st, case when st = 'na' then null else prev_as end)
      on conflict (client_id, period, task_code) do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    end loop;
  end loop;
  return inserted;
end $$;
grant execute on function public.generate_period(date) to authenticated;

-- ---------------------------------------------------------------------
-- ZABEZPIECZENIA (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.team_members       enable row level security;
alter table public.clients            enable row level security;
alter table public.client_partners    enable row level security;
alter table public.client_assignments enable row level security;
alter table public.task_types         enable row level security;
alter table public.checklist_entries  enable row level security;
alter table public.period_notes       enable row level security;
alter table public.audit_log          enable row level security;

-- Niezalogowani (anon) nie mają dostępu do żadnej tabeli
revoke all on all tables in schema public from anon;

-- zespół
create policy team_select on public.team_members for select to authenticated
  using (public.current_member_id() is not null);
create policy team_admin_ins on public.team_members for insert to authenticated
  with check (public.is_admin());
create policy team_admin_upd on public.team_members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy team_admin_del on public.team_members for delete to authenticated
  using (public.is_admin() and id <> public.current_member_id());

-- klienci
create policy clients_select on public.clients for select to authenticated
  using (public.can_see_client(id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_full_access());
create policy clients_update on public.clients for update to authenticated
  using (public.has_full_access()) with check (public.has_full_access());
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_admin());

-- wspólnicy
create policy partners_select on public.client_partners for select to authenticated
  using (public.can_see_client(client_id));
create policy partners_write on public.client_partners for all to authenticated
  using (public.has_full_access()) with check (public.has_full_access());

-- przypisania
create policy assign_select on public.client_assignments for select to authenticated
  using (public.has_full_access() or member_id = public.current_member_id());
create policy assign_write on public.client_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- kolumny listy kontrolnej
create policy tasks_select on public.task_types for select to authenticated
  using (public.current_member_id() is not null);
create policy tasks_write on public.task_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- rozliczenia
create policy entries_select on public.checklist_entries for select to authenticated
  using (public.can_see_client(client_id));
create policy entries_insert on public.checklist_entries for insert to authenticated
  with check (public.can_see_client(client_id));
create policy entries_update on public.checklist_entries for update to authenticated
  using (public.can_see_client(client_id)) with check (public.can_see_client(client_id));
create policy entries_delete on public.checklist_entries for delete to authenticated
  using (public.is_admin());

create policy notes_select on public.period_notes for select to authenticated
  using (public.can_see_client(client_id));
create policy notes_insert on public.period_notes for insert to authenticated
  with check (public.can_see_client(client_id));
create policy notes_update on public.period_notes for update to authenticated
  using (public.can_see_client(client_id)) with check (public.can_see_client(client_id));

-- historia
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin() or (client_id is not null and public.can_see_client(client_id)));

-- Zmiany na żywo (inni widzą Twoje kliknięcia bez odświeżania)
alter publication supabase_realtime add table public.checklist_entries, public.period_notes;

-- ---------------------------------------------------------------------
-- ZESPÓŁ RKDP
-- ---------------------------------------------------------------------
insert into public.team_members (email, full_name, short_name, role) values
  ('michal@ruszniak.io',           'Michał Ruszniak',      'Michał',   'admin'),
  ('natalia.piechota@rkdp.pl',     'Natalia Piechota',     'Natalia',  'full'),
  ('patrycja.cwynar@rkdp.pl',      'Patrycja Cwynar',      'Patrycja', 'full'),
  ('jakub.cwynar@rkdp.pl',         'Jakub Cwynar',         'Kuba',     'limited'),
  ('weronika.rzepkowska@rkdp.pl',  'Weronika Rzepkowska',  'Weronika', 'limited');
