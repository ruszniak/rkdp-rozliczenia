-- 003: kolumny, które nie wpływają na status „Klient rozliczony” (np. wyciągi bankowe)
alter table public.task_types add column if not exists counts_to_settled boolean not null default true;
update public.task_types set counts_to_settled = false,
  description = 'Czy wyciągi bankowe zostały zaksięgowane (nie wpływa na status „Klient rozliczony”)'
 where code = 'wb';
