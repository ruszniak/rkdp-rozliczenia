-- =====================================================================
-- 002: podział na Księgowość i Kadry/ZUS, księgowa i kadrowa przy kliencie
-- =====================================================================

-- 1. Księgowa i kadrowa klienta
alter table public.clients
  add column if not exists accountant_id uuid references public.team_members(id) on delete set null,
  add column if not exists hr_id         uuid references public.team_members(id) on delete set null;

-- przypisanie z dotychczasowych danych (osoby wpisane w komórkach za ostatni miesiąc)
with last as (select max(period) p from public.checklist_entries),
acc as (
  select distinct on (e.client_id) e.client_id, e.assignee_id
    from public.checklist_entries e, last
   where e.period = last.p and e.assignee_id is not null
     and e.task_code in ('ksiegowanie','saldeo','pit_cit','vat','jpk','wb')
   group by e.client_id, e.assignee_id
   order by e.client_id, count(*) desc),
hr as (
  select distinct on (e.client_id) e.client_id, e.assignee_id
    from public.checklist_entries e, last
   where e.period = last.p and e.assignee_id is not null
     and e.task_code in ('lista_plac','zus_podany','zus_wyslany')
   group by e.client_id, e.assignee_id
   order by e.client_id, count(*) desc)
update public.clients c set
  accountant_id = coalesce(c.accountant_id, (select assignee_id from acc where acc.client_id = c.id)),
  hr_id         = coalesce(c.hr_id,         (select assignee_id from hr  where hr.client_id  = c.id));

-- klienci z jedną osobą przypisaną, a bez księgowej → ta osoba jest księgową
update public.clients c set accountant_id = a.member_id
  from (select client_id, min(member_id::text)::uuid member_id from public.client_assignments
         group by client_id having count(*) = 1) a
 where a.client_id = c.id and c.accountant_id is null;

-- 2. Kolumny listy: obszar, dla kogo, opis (podpowiedź po najechaniu)
alter table public.task_types
  add column if not exists area        text not null default 'ksiegowosc' check (area in ('ksiegowosc','kadry')),
  add column if not exists applies_to  text not null default 'all' check (applies_to in ('all','osobowe','kapitalowe')),
  add column if not exists description text;

alter table public.task_types drop constraint if exists task_types_rule_check;
alter table public.task_types add constraint task_types_rule_check
  check (rule in ('always','payroll','zus','income_tax','vat_return','jpk'));

update public.task_types set label='Saldeo',  sort=10, area='ksiegowosc', applies_to='all',
  description='Czy klient zatwierdził dokumenty w Saldeo' where code='saldeo';
update public.task_types set label='Rewizor', sort=20, area='ksiegowosc', applies_to='all',
  description='Czy dokumenty zostały zaksięgowane w Rewizorze' where code='ksiegowanie';
update public.task_types set label='PIT / CIT', sort=30, area='ksiegowosc', applies_to='all',
  description='Czy podatek dochodowy (PIT dla JDG i spółek osobowych, CIT dla spółek) został podany klientowi' where code='pit_cit';
update public.task_types set label='VAT', sort=40, area='ksiegowosc', applies_to='all',
  description='Czy kwota VAT została podana klientowi' where code='vat';
update public.task_types set label='JPK VAT', sort=50, area='ksiegowosc', applies_to='all',
  description='Czy plik JPK_V7 został wysłany' where code='jpk';
update public.task_types set label='Wyciągi bankowe', sort=60, area='ksiegowosc', applies_to='kapitalowe',
  description='Czy wyciągi bankowe zostały zaksięgowane' where code='wb';
update public.task_types set label='ZUS podany', sort=110, area='kadry', applies_to='all',
  description='Czy kwota składek ZUS została podana klientowi' where code='zus_podany';
update public.task_types set label='ZUS wysłany', sort=130, area='kadry', applies_to='all',
  description='Czy deklaracja ZUS DRA została wysłana' where code='zus_wyslany';
update public.task_types set label='Lista płac', sort=900, area='kadry', active=false,
  description='(stara kolumna z Excela – zastąpiona przez PIT-4)' where code='lista_plac';

insert into public.task_types (code, label, sort, rule, area, applies_to, description)
values ('pit4', 'PIT-4 podany', 120, 'payroll', 'kadry', 'all',
        'Czy zaliczka na podatek od wynagrodzeń (PIT-4) została podana klientowi')
on conflict (code) do nothing;

-- PIT-4 za istniejące miesiące: na podstawie dawnej kolumny „Lista płac”
insert into public.checklist_entries (client_id, period, task_code, status)
select client_id, period, 'pit4', status from public.checklist_entries
 where task_code = 'lista_plac'
on conflict (client_id, period, task_code) do nothing;

-- „W toku” nie jest już używane
update public.checklist_entries set status = 'todo' where status = 'in_progress';

-- 3. Do której tabeli księgowej należy klient
create or replace function public.client_section(c public.clients) returns text
language sql immutable set search_path = public as $$
  select case
    when c.legal_form in ('spzoo','spolka_akcyjna') then 'kapitalowe'
    when c.legal_form in ('jdg','spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa') then 'osobowe'
    when c.bookkeeping = 'pelna' then 'kapitalowe'
    else 'osobowe' end
$$;

-- 4. Widoczność: księgowa i kadrowa widzą „swoich” klientów
create or replace function public.can_see_client(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_full_access()
      or exists (select 1 from public.clients c
                  where c.id = cid and public.current_member_id() in (c.accountant_id, c.hr_id))
      or exists (select 1 from public.client_assignments a
                  where a.client_id = cid and a.member_id = public.current_member_id())
$$;

-- 5. Otwieranie miesiąca z uwzględnieniem obszaru i rodzaju klienta
create or replace function public.generate_period(p_period date) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  per      date := date_trunc('month', p_period)::date;
  prev     date := (date_trunc('month', p_period) - interval '1 month')::date;
  q_end    boolean := extract(month from p_period)::int in (3,6,9,12);
  c        public.clients%rowtype;
  t        public.task_types%rowtype;
  st       text;
  prev_st  text;
  sect     text;
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
    sect := public.client_section(c);
    is_company := c.legal_form in ('spzoo','spolka_akcyjna');
    is_partner := c.legal_form in ('spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa');
    select count(*) > 0,
           coalesce(bool_or(zus_type is distinct from 'brak'), false),
           coalesce(bool_or(coalesce(pit_advances,'miesieczne') <> 'kwartalne'), false)
      into p_any, p_zus, p_monthly
      from public.client_partners where client_id = c.id and settled_by_us;

    for t in select * from public.task_types where active order by sort loop
      if t.applies_to <> 'all' and t.applies_to <> sect then continue; end if;
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

      if st is null then
        select e.status into prev_st from public.checklist_entries e
         where e.client_id = c.id and e.period = prev and e.task_code = t.code;
        st := case when prev_st = 'na' then 'na' else 'todo' end;
      end if;

      insert into public.checklist_entries (client_id, period, task_code, status)
      values (c.id, per, t.code, st)
      on conflict (client_id, period, task_code) do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    end loop;
  end loop;
  return inserted;
end $$;

revoke execute on function public.generate_period(date) from public, anon;
grant execute on function public.generate_period(date) to authenticated;
revoke execute on function public.can_see_client(uuid) from public, anon;
grant execute on function public.can_see_client(uuid) to authenticated;
