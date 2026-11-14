-- Naprawa „case not found” przy tworzeniu listy kratek na miesiąc („Dodaj” przy „klientów bez listy”):
-- generate_period nie znało reguły 'ksiegi' (kratka „Wyciągi bankowe” – tylko pełna księgowość) i nie miało gałęzi ELSE.
create or replace function public.generate_period(p_period date)
 returns integer language plpgsql set search_path to 'public'
as $function$
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
    is_company := c.legal_form in ('spzoo','spolka_akcyjna') or (c.legal_form = 'spolka_komandytowa' and c.cit_type is not null);
    is_partner := c.legal_form in ('spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa') and not is_company;
    select count(*) > 0,
           coalesce(bool_or(zus_type is distinct from 'brak'), false),
           coalesce(bool_or(coalesce(pit_advances,'miesieczne') <> 'kwartalne'), false)
      into p_any, p_zus, p_monthly
      from public.client_partners where client_id = c.id and settled_by_us;

    for t in select * from public.task_types where active order by sort loop
      if t.applies_to <> 'all' and t.applies_to <> sect then continue; end if;
      if c.service_scope = 'doradztwo' and (t.area <> 'kadry' or not coalesce(c.has_employees, false)) then continue; end if;
      st := null;
      case t.rule
        when 'always' then st := 'todo';
        when 'ksiegi' then
          st := case when c.bookkeeping = 'pelna' or (c.bookkeeping is null and sect = 'kapitalowe') then 'todo' else 'na' end;
        when 'payroll' then
          st := case when c.has_employees is null then null when c.has_employees then 'todo' else 'na' end;
        when 'zus' then
          if c.has_employees then st := 'todo';
          elsif c.legal_form = 'jdg' then
            st := case when c.zus_type is null then null when c.zus_type = 'brak' then 'na' else 'todo' end;
          elsif is_partner and p_any then
            st := 'na';
          elsif c.has_employees = false and c.legal_form is not null then st := 'na';
          end if;
        when 'income_tax' then
          if c.legal_form = 'jdg' then
            if c.pit_form is not null then
              st := case when c.pit_advances = 'kwartalne' and not q_end then 'na' else 'todo' end;
            end if;
          elsif is_partner and p_any then
            st := 'na';
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
        else st := null;
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
    inserted := inserted + public.partner_entries_for(c.id, per);
  end loop;
  return inserted;
end $function$;
