-- Wspólnicy spółek osobowych: osobne kratki PIT i ZUS dla każdego wspólnika rozliczanego przez biuro.
-- Kratki klienta „PIT / CIT” i „ZUS” przy spółce z wspólnikami = „nie dotyczy” (ZUS spółki zostaje, gdy ma pracowników).
create table public.partner_entries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.client_partners(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  task_code text not null check (task_code in ('pit_cit','zus_podany','zus_wyslany')),
  status text not null default 'todo' check (status in ('todo','in_progress','missing_docs','reminded','done','na')),
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (partner_id, period, task_code)
);
create index partner_entries_client_period on public.partner_entries (client_id, period);
alter table public.partner_entries enable row level security;
create policy pe_select on public.partner_entries for select to authenticated using ((select has_full_access()) or client_id in (select visible_client_ids()));
create policy pe_insert on public.partner_entries for insert to authenticated with check ((select has_full_access()) or client_id in (select visible_client_ids()));
create policy pe_update on public.partner_entries for update to authenticated using ((select has_full_access()) or client_id in (select visible_client_ids())) with check ((select has_full_access()) or client_id in (select visible_client_ids()));
create policy pe_delete on public.partner_entries for delete to authenticated using ((select is_admin()));
create or replace function public.partner_entries_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(nullif(public.current_email(), ''), 'system');
  return new;
end $$;
create trigger touch_partner_entries before insert or update on public.partner_entries for each row execute function public.partner_entries_touch();
create trigger audit_partner_entries after delete or update on public.partner_entries for each row execute function public.write_audit();

-- utworzenie brakujących kratek wspólników klienta w danym miesiącu (istniejące zostają bez zmian)
create or replace function public.partner_entries_for(p_client uuid, p_period date) returns integer
language plpgsql set search_path = public as $$
declare
  per date := date_trunc('month', p_period)::date;
  q_end boolean := extract(month from p_period)::int in (3,6,9,12);
  n integer;
begin
  insert into public.partner_entries (partner_id, client_id, period, task_code, status)
  select p.id, p.client_id, per, t.code,
         case t.code
           when 'pit_cit' then case when p.pit_advances = 'kwartalne' and not q_end then 'na' else 'todo' end
           else case when p.zus_type = 'brak' then 'na' else 'todo' end end
    from public.client_partners p
    cross join (values ('pit_cit'), ('zus_podany'), ('zus_wyslany')) t(code)
   where p.client_id = p_client and p.settled_by_us
  on conflict (partner_id, period, task_code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- po zapisaniu wspólników w karcie klienta: kratki wspólników w otwartych miesiącach (ostatnie 3) + „nie dotyczy” w kratkach PIT/ZUS spółki
create or replace function public.sync_partner_entries(p_client uuid) returns integer
language plpgsql set search_path = public as $$
declare
  r record; n integer := 0;
begin
  if not ((select has_full_access()) or p_client in (select visible_client_ids())) then raise exception 'Brak dostępu'; end if;
  for r in select distinct period from public.checklist_entries where client_id = p_client and period >= (date_trunc('month', now()) - interval '2 months')::date loop
    n := n + public.partner_entries_for(p_client, r.period);
  end loop;
  if exists (select 1 from public.client_partners where client_id = p_client and settled_by_us) then
    update public.checklist_entries e set status = 'na'
     from public.clients c
     where e.client_id = p_client and c.id = p_client and e.status not in ('done','na')
       and e.period >= (date_trunc('month', now()) - interval '2 months')::date
       and (e.task_code = 'pit_cit' or (e.task_code in ('zus_podany','zus_wyslany') and not coalesce(c.has_employees, false)))
       and c.legal_form in ('spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa')
       and not (c.legal_form = 'spolka_komandytowa' and c.cit_type is not null);
  end if;
  return n;
end $$;
revoke execute on function public.partner_entries_for(uuid, date) from public, anon;
grant execute on function public.sync_partner_entries(uuid) to authenticated;

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
    -- spółka komandytowa z ustawionym rodzajem CIT = podatnik CIT (zaliczki CIT spółki, nie PIT wspólników)
    is_company := c.legal_form in ('spzoo','spolka_akcyjna') or (c.legal_form = 'spolka_komandytowa' and c.cit_type is not null);
    is_partner := c.legal_form in ('spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa') and not is_company;
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
            st := 'na';  -- ZUS wspólników: osobne kratki przy wspólnikach (partner_entries)
          elsif c.has_employees = false and c.legal_form is not null then st := 'na';
          end if;
        when 'income_tax' then
          if c.legal_form = 'jdg' then
            if c.pit_form is not null then
              st := case when c.pit_advances = 'kwartalne' and not q_end then 'na' else 'todo' end;
            end if;
          elsif is_partner and p_any then
            st := 'na';  -- PIT wspólników: osobne kratki przy wspólnikach (partner_entries)
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
    -- kratki wspólników (PIT, ZUS) – dla wspólników rozliczanych przez biuro
    inserted := inserted + public.partner_entries_for(c.id, per);
  end loop;
  return inserted;
end $fn$;
