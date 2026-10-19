-- 019: weryfikacja AML klientów – osobno dla RKDP i M2 TAX (różne instytucje obowiązane), ta sama procedura.
-- Karta AML klienta (aml_cases) + niezmienialny rejestr sprawdzeń (aml_checks: CRBR, KRS, Biała lista VAT,
-- listy sankcyjne, ocena ryzyka, PEP, zatwierdzenie). Sprawdzenia automatyczne zapisuje funkcja „aml”.

create table if not exists public.aml_cases (
  id            uuid primary key default gen_random_uuid(),
  module        text not null check (module in ('rkdp','m2')),
  client_id     uuid unique references public.clients(id) on delete cascade,
  m2_client_id  uuid unique references public.m2_clients(id) on delete cascade,
  status        text not null default 'do_uzupelnienia' check (status in ('do_uzupelnienia','w_trakcie','wymaga_uwagi','zweryfikowany','odmowa')),
  risk_level    text check (risk_level in ('niskie','standardowe','podwyzszone')),
  risk_answers  jsonb not null default '{}'::jsonb,
  risk_score    int,
  risk_note     text,
  pep           text not null default 'nieustalone' check (pep in ('nie','tak','nieustalone')),
  pep_statement_at date,
  id_verified   text,               -- sposób weryfikacji tożsamości (np. dowód osobisty okazany, mObywatel, KRS)
  verified_at   timestamptz,
  verified_by   uuid references public.team_members(id) on delete set null,
  next_review   date,
  last_auto_at  timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((module = 'rkdp' and client_id is not null and m2_client_id is null) or (module = 'm2' and m2_client_id is not null and client_id is null))
);
create index if not exists aml_cases_review_idx on public.aml_cases (module, next_review);

create table if not exists public.aml_checks (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.aml_cases(id) on delete cascade,
  kind        text not null check (kind in ('crbr','krs','vat','sankcje','ryzyko','pep','tozsamosc','zatwierdzenie','notatka')),
  result      text not null check (result in ('ok','uwaga','brak','blad','info')),
  summary     text,
  data        jsonb not null default '{}'::jsonb,
  raw         text,                 -- pełna odpowiedź źródła (np. XML z API CRBR)
  sha256      text,                 -- skrót odpowiedzi – dowód, że zapis nie był zmieniany
  request_id  text,                 -- identyfikator wniosku nadany przez CRBR
  checked_at  timestamptz not null default now(),
  checked_by  uuid references public.team_members(id) on delete set null default public.current_member_id()
);
create index if not exists aml_checks_case_idx on public.aml_checks (case_id, checked_at desc);

-- listy sankcyjne (pobierane przez funkcję; niedostępne bezpośrednio dla aplikacji)
create table if not exists public.sanctions_lists (
  source     text primary key,
  fetched_at timestamptz not null default now(),
  entries    int not null default 0,
  names      jsonb not null default '[]'::jsonb,
  error      text
);
alter table public.sanctions_lists enable row level security;

drop trigger if exists aml_cases_touch on public.aml_cases;
create trigger aml_cases_touch before update on public.aml_cases for each row execute function public.touch_row();

create or replace function public.can_see_aml_case(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from aml_cases a where a.id = c and (
    (a.module = 'rkdp' and public.has_module('rozliczenia') and (public.has_full_access() or a.client_id in (select public.visible_client_ids())))
    or (a.module = 'm2' and public.has_module('doradztwo'))))
$$;
revoke execute on function public.can_see_aml_case(uuid) from public, anon;
grant execute on function public.can_see_aml_case(uuid) to authenticated;

alter table public.aml_cases enable row level security;
drop policy if exists aml_cases_select on public.aml_cases;
create policy aml_cases_select on public.aml_cases for select to authenticated using (
  (module = 'rkdp' and (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())))
  or (module = 'm2' and (select public.has_module('doradztwo'))));
drop policy if exists aml_cases_insert on public.aml_cases;
create policy aml_cases_insert on public.aml_cases for insert to authenticated with check (
  (module = 'rkdp' and (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())))
  or (module = 'm2' and (select public.has_module('doradztwo'))));
drop policy if exists aml_cases_update on public.aml_cases;
create policy aml_cases_update on public.aml_cases for update to authenticated
  using ((module = 'rkdp' and (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())))
    or (module = 'm2' and (select public.has_module('doradztwo'))))
  with check ((module = 'rkdp' and (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())))
    or (module = 'm2' and (select public.has_module('doradztwo'))));
drop policy if exists aml_cases_delete on public.aml_cases;
create policy aml_cases_delete on public.aml_cases for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.aml_cases to authenticated;

-- rejestr sprawdzeń: dopisywanie tak, zmiana i usuwanie – nie (pełny ślad dla kontroli)
alter table public.aml_checks enable row level security;
drop policy if exists aml_checks_select on public.aml_checks;
create policy aml_checks_select on public.aml_checks for select to authenticated using ((select public.can_see_aml_case(case_id)));
drop policy if exists aml_checks_insert on public.aml_checks;
create policy aml_checks_insert on public.aml_checks for insert to authenticated
  with check (checked_by = (select public.current_member_id()) and (select public.can_see_aml_case(case_id))
    and kind in ('ryzyko','pep','tozsamosc','zatwierdzenie','notatka'));
grant select, insert on public.aml_checks to authenticated;
