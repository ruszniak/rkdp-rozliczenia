-- Zakres usług klienta: księgowość (pełna obsługa) albo tylko doradztwo podatkowe (umowa na DP, bez księgowości).
-- Klient „tylko DP” nie dostaje kratek księgowych; kratki kadrowe – tylko gdy biuro prowadzi mu kadry (has_employees).
alter table public.clients add column if not exists service_scope text not null default 'ksiegowosc';
alter table public.clients add constraint clients_service_scope_chk check (service_scope in ('ksiegowosc','doradztwo'));

create or replace function public.generate_period(p_period date) returns integer
language plpgsql set search_path = public as $fn$
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
      -- klient tylko na doradztwo podatkowe: bez kratek księgowych; kadry tylko, gdy prowadzimy mu kadry
      if c.service_scope = 'doradztwo' and (t.area = 'ksiegowosc' or not coalesce(c.has_employees, false)) then continue; end if;
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
end $fn$;
