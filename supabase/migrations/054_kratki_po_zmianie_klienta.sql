-- Spójność: po zmianie ustawień klienta (VAT, PIT/CIT, zaliczki, ZUS, pracownicy, forma, zakres usług)
-- kratki w otwartych miesiącach (poprzedni i bieżący) przeliczają się same.
-- Ruszamy tylko kratki „do zrobienia” i „nie dotyczy” bez kwoty – zrobione, braki dokumentów, przypomnienia i kwoty zostają.

create or replace function public.client_task_status(c public.clients, t public.task_types, p_period date) returns text
language plpgsql stable set search_path = public as $$
declare
  q_end boolean := extract(month from p_period)::int in (3,6,9,12);
  is_company boolean := c.legal_form in ('spzoo','spolka_akcyjna') or (c.legal_form = 'spolka_komandytowa' and c.cit_type is not null);
  is_partner boolean := c.legal_form in ('spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa') and not is_company;
  p_any boolean;
begin
  if t.applies_to <> 'all' and t.applies_to <> public.client_section(c) then return 'na'; end if;
  if c.service_scope = 'doradztwo' and (t.area = 'ksiegowosc' or not coalesce(c.has_employees, false)) then return 'na'; end if;
  select count(*) > 0 into p_any from public.client_partners where client_id = c.id and settled_by_us;
  case t.rule
    when 'always' then return 'todo';
    when 'payroll' then return case when c.has_employees is null then null when c.has_employees then 'todo' else 'na' end;
    when 'zus' then
      if c.has_employees then return 'todo';
      elsif c.legal_form = 'jdg' then return case when c.zus_type is null then null when c.zus_type = 'brak' then 'na' else 'todo' end;
      elsif is_partner and p_any then return 'na';
      elsif c.has_employees = false and c.legal_form is not null then return 'na';
      end if;
      return null;
    when 'income_tax' then
      if c.legal_form = 'jdg' then
        if c.pit_form is null then return null; end if;
        return case when c.pit_advances = 'kwartalne' and not q_end then 'na' else 'todo' end;
      elsif is_partner and p_any then return 'na';
      elsif c.legal_form = 'fundacja_rodzinna' then return 'na';
      elsif is_company and c.cit_type is not null then
        return case when c.cit_type = 'estonski' or c.cit_advances = 'brak' then 'na'
                    when c.cit_advances = 'kwartalne' and not q_end then 'na' else 'todo' end;
      end if;
      return null;
    when 'vat_return' then
      return case when c.vat_status is null then null when c.vat_status = 'czynny_miesieczny' then 'todo'
                  when c.vat_status = 'czynny_kwartalny' then case when q_end then 'todo' else 'na' end else 'na' end;
    when 'jpk' then
      return case when c.vat_status is null then null when c.vat_status like 'czynny%' then 'todo' else 'na' end;
    else return null;
  end case;
end $$;

create or replace function public.clients_resync_entries() returns trigger
language plpgsql set search_path = public as $$
declare
  e record; st text;
begin
  if new.status <> 'aktywny' then return new; end if;
  for e in
    select ce.id, ce.status, ce.period, t as tt
      from public.checklist_entries ce join public.task_types t on t.code = ce.task_code
     where ce.client_id = new.id and ce.period >= (date_trunc('month', now()) - interval '1 month')::date
       and ce.status in ('todo','na') and ce.amount is null
  loop
    st := public.client_task_status(new, e.tt, e.period);
    if st is not null and st <> e.status then
      update public.checklist_entries set status = st where id = e.id;
    end if;
  end loop;
  return new;
end $$;

create trigger clients_resync_entries after update of legal_form, bookkeeping, service_scope, pit_form, pit_advances, zus_type, has_employees, cit_type, cit_advances, vat_status
  on public.clients for each row execute function public.clients_resync_entries();
