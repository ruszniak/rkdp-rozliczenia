-- Wyciągi bankowe: dla klientów z księgami handlowymi (bookkeeping = 'pelna'; bez ustawienia – spółki kapitałowe),
-- reguła 'ksiegi' w client_task_status; kratki od stycznia 2026 dla aktywnych klientów z księgami. Zastosowano jako "wyciagi_ksiegi_handlowe".
alter table public.task_types drop constraint if exists task_types_rule_check;
alter table public.task_types add constraint task_types_rule_check check (rule in ('always','payroll','zus','income_tax','vat_return','jpk','ksiegi'));
-- client_task_status: when 'ksiegi' then return case when c.bookkeeping = 'pelna' or (c.bookkeeping is null and client_section(c) = 'kapitalowe') then 'todo' else 'na' end;
update public.task_types set applies_to = 'all', rule = 'ksiegi' where code = 'wb';
insert into public.checklist_entries (client_id, period, task_code, status)
select c.id, m.p, 'wb', 'todo'
from public.clients c
cross join (select generate_series('2026-01-01'::date, '2026-10-01'::date, interval '1 month')::date p) m
where c.status = 'aktywny' and (c.bookkeeping = 'pelna' or (c.bookkeeping is null and c.legal_form in ('spzoo','spolka_akcyjna','fundacja_rodzinna')))
  and not exists (select 1 from public.checklist_entries e where e.client_id = c.id and e.period = m.p and e.task_code = 'wb');
