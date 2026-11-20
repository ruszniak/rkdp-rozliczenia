-- 096: koszt księgowych – domyślnie liczą się klienci osoby jako księgowej i jako kadrowej
alter table public.staff_pay alter column basis set default 'obie';
update public.staff_pay set basis = 'obie' where basis = 'ksiegowa';
