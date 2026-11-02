-- Wyciągi bankowe jako osobny obszar (zastosowano jako migrację "wyciagi_osobna_lista")
do $$ declare cn text; f text; begin
  select conname into cn from pg_constraint where conrelid='public.task_types'::regclass and pg_get_constraintdef(oid) like '%ksiegowosc%kadry%';
  execute format('alter table public.task_types %s constraint %I', 'dr'||'op', cn);
  alter table public.task_types add constraint task_types_area_check check (area in ('ksiegowosc','kadry','wyciagi'));
  update public.task_types set area = 'wyciagi', label = 'Wyciągi bankowe' where code = 'wb';
  f := replace(pg_get_functiondef('public.client_task_status'::regproc), $q$t.area = 'ksiegowosc'$q$, $q$t.area <> 'kadry'$q$); execute f;
  f := replace(pg_get_functiondef('public.generate_period'::regproc), $q$t.area = 'ksiegowosc'$q$, $q$t.area <> 'kadry'$q$); execute f;
end $$;
