-- „Pełnomocnictwo ZUS PEL”: puste = TAK, domyślnie TAK (braki ustawione ręcznie wg uwag w Rozliczeniach)
update public.clients set zus_pel = true where zus_pel is null;
alter table public.clients alter column zus_pel set default true;
