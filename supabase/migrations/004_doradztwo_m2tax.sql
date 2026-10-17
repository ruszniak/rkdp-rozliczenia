-- =====================================================================
-- 004: moduł Doradztwo podatkowe (M2 TAX) – osobna lista klientów i spraw
-- Dostęp tylko dla osób z modułem 'doradztwo' (Michał + wskazani).
-- =====================================================================

-- 1. Moduły dostępu per pracownik
alter table public.team_members
  add column if not exists modules text[] not null default '{rozliczenia}',
  add column if not exists job_title text,
  add column if not exists license_no text;

update public.team_members set modules = '{rozliczenia,doradztwo}' where role = 'admin';

create or replace function public.has_module(m text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                  where email = public.current_email() and active and m = any(modules))
$$;

-- pełny dostęp do Rozliczeń tylko z modułem 'rozliczenia'
create or replace function public.has_full_access() returns boolean
language sql stable set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin','full'), false) and public.has_module('rozliczenia')
$$;

revoke execute on function public.has_module(text) from public, anon;
grant execute on function public.has_module(text) to authenticated;

-- 2. Ustawienia aplikacji (np. adres kalendarza Google, Zoho)
create table if not exists public.app_settings (
  key   text primary key,
  value text
);
alter table public.app_settings enable row level security;
create policy settings_select on public.app_settings for select to authenticated
  using (public.current_member_id() is not null);
create policy settings_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.app_settings (key, value) values
  ('m2_google_calendar_src', null),
  ('m2_zoho_bookings_url', 'https://m2taxdoradcypodatkowi.zohobookings.eu/m2taxdoradcypodatkowi')
on conflict (key) do nothing;

-- 3. Osoby podpisujące zlecenia
create table if not exists public.m2_signers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  title       text not null default 'Doradca podatkowy',
  license_no  text,
  role_label  text default 'Partner zarządzający',
  active      boolean not null default true,
  sort        integer not null default 0
);
insert into public.m2_signers (full_name, license_no, sort) values
  ('Marcin Otręba', '14609', 1),
  ('Michał Ruszniak', '15009', 2);

-- 4. Klienci M2 TAX
create table if not exists public.m2_clients (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null default 'firma' check (kind in ('firma','osoba')),
  name             text not null,
  nip              text,
  regon            text,
  krs              text,
  address          text,
  mail_address     text,          -- adres do korespondencji, jeśli inny
  email            text,
  phone            text,
  contact_person   text,
  industry         text,
  source           text,          -- skąd klient (polecenie, strona, Zoho…)
  billing_type     text check (billing_type in ('godzinowa','ryczalt','abonament','mieszana')),
  hourly_rate      numeric(10,2),
  subscription     text,          -- pakiet abonamentu
  monthly_fee      numeric(10,2),
  rate_notes       text,
  aml_verified_at  date,          -- data identyfikacji i weryfikacji (AML)
  aml_risk         text check (aml_risk in ('niskie','standardowe','podwyzszone')),
  beneficial_owner text,
  aml_notes        text,
  status           text not null default 'aktywny' check (status in ('aktywny','archiwum')),
  notes            text,
  created_by       text default public.current_email(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.m2_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.m2_clients(id) on delete cascade,
  full_name  text not null,
  role       text,
  email      text,
  phone      text,
  notes      text
);

-- 5. Sprawy
create table if not exists public.m2_matters (
  id              uuid primary key default gen_random_uuid(),
  number          text unique,
  client_id       uuid not null references public.m2_clients(id) on delete restrict,
  title           text not null,
  matter_type     text not null default 'konsultacja',
  authority       text,           -- organ: US, UCS, DIAS, WSA, NSA, KIS…
  case_ref        text,           -- sygnatura / znak sprawy
  tax_kind        text,           -- VAT, CIT, PIT, PCC, podatek od nieruchomości…
  tax_period      text,           -- okres, którego dotyczy
  value_in_dispute numeric(14,2),
  status          text not null default 'nowa'
                  check (status in ('nowa','w_toku','oczekuje_organ','oczekuje_klient','zawieszona','zakonczona')),
  stage           text,
  lead_id         uuid references public.team_members(id) on delete set null,
  second_id       uuid references public.team_members(id) on delete set null,
  assistant_id    uuid references public.team_members(id) on delete set null,
  poa_type        text,           -- pełnomocnictwo: PPS-1, UPL-1, procesowe…
  poa_date        date,
  opened_at       date not null default current_date,
  closed_at       date,
  fee_type        text check (fee_type in ('godzinowa','ryczalt','abonament','success_fee','mieszana')),
  fee_amount      numeric(12,2),
  estimated_hours numeric(8,2),
  description     text,
  outcome         text,
  created_by      text default public.current_email(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists m2_matters_client_idx on public.m2_matters(client_id);

-- numer sprawy: S/2026/001
create or replace function public.m2_matter_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(coalesce(new.opened_at, current_date), 'YYYY'); n int;
begin
  if new.number is null then
    select coalesce(max(split_part(number, '/', 3)::int), 0) + 1 into n
      from public.m2_matters where number like 'S/' || y || '/%';
    new.number := 'S/' || y || '/' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
create trigger m2_matter_number before insert on public.m2_matters
  for each row execute function public.m2_matter_number();

-- 6. Terminy i wydarzenia (kalendarz)
create table if not exists public.m2_deadlines (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid references public.m2_matters(id) on delete cascade,
  client_id   uuid references public.m2_clients(id) on delete cascade,
  title       text not null,
  kind        text not null default 'procesowy'
              check (kind in ('procesowy','organ','wewnetrzny','spotkanie','przedawnienie')),
  due_date    date not null,
  due_time    time,
  served_at   date,             -- data doręczenia (dla terminów liczonych z kalkulatora)
  basis       text,             -- podstawa prawna / opis wyliczenia
  assignee_id uuid references public.team_members(id) on delete set null,
  done        boolean not null default false,
  done_at     timestamptz,
  notes       text,
  created_by  text default public.current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists m2_deadlines_due_idx on public.m2_deadlines(due_date) where not done;

-- 7. Dziennik sprawy (korespondencja, czynności, notatki)
create table if not exists public.m2_journal (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references public.m2_matters(id) on delete cascade,
  entry_date  date not null default current_date,
  kind        text not null default 'notatka'
              check (kind in ('notatka','pismo_otrzymane','pismo_wyslane','telefon','spotkanie','czynnosc')),
  title       text not null,
  body        text,
  author      text default public.current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists m2_journal_matter_idx on public.m2_journal(matter_id, entry_date desc);

-- 8. Czas pracy
create table if not exists public.m2_time (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references public.m2_matters(id) on delete cascade,
  member_id   uuid references public.team_members(id) on delete set null,
  work_date   date not null default current_date,
  minutes     integer not null check (minutes > 0),
  description text,
  billable    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists m2_time_matter_idx on public.m2_time(matter_id);

-- 9. Zlecenia
create table if not exists public.m2_orders (
  id             uuid primary key default gen_random_uuid(),
  number         text unique,
  client_id      uuid not null references public.m2_clients(id) on delete restrict,
  matter_id      uuid references public.m2_matters(id) on delete set null,
  order_date     date not null default current_date,
  subject        text not null,       -- przedmiot zlecenia
  scope          text,                -- szczegółowy zakres (punkty)
  fee_type       text check (fee_type in ('godzinowa','ryczalt','abonament','success_fee','mieszana')),
  fee_amount     numeric(12,2),
  fee_notes      text,
  payment_days   integer default 14,
  term_text      text,                -- termin wykonania
  extra_terms    text,                -- postanowienia dodatkowe
  signer_id      uuid references public.m2_signers(id) on delete set null,
  status         text not null default 'projekt' check (status in ('projekt','wyslane','podpisane','anulowane')),
  created_by     text default public.current_email(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.m2_order_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(coalesce(new.order_date, current_date), 'YYYY'); n int;
begin
  if new.number is null then
    select coalesce(max(split_part(number, '/', 3)::int), 0) + 1 into n
      from public.m2_orders where number like 'Z/' || y || '/%';
    new.number := 'Z/' || y || '/' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
create trigger m2_order_number before insert on public.m2_orders
  for each row execute function public.m2_order_number();

create or replace function public.m2_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger m2_clients_touch before update on public.m2_clients for each row execute function public.m2_touch();
create trigger m2_matters_touch before update on public.m2_matters for each row execute function public.m2_touch();
create trigger m2_orders_touch  before update on public.m2_orders  for each row execute function public.m2_touch();

revoke execute on function public.m2_matter_number(), public.m2_order_number(), public.m2_touch() from public, anon, authenticated;

-- 10. Zabezpieczenia: tylko osoby z modułem 'doradztwo'
do $$
declare t text;
begin
  foreach t in array array['m2_signers','m2_clients','m2_contacts','m2_matters','m2_deadlines','m2_journal','m2_time','m2_orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_module(''doradztwo'')) with check (public.has_module(''doradztwo''))', t || '_m2', t);
  end loop;
end $$;

-- Na żywo
alter publication supabase_realtime add table public.m2_deadlines;
