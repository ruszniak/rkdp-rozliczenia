-- „Pełnomocnictwo UPL-1 (US)”: puste = TAK, domyślnie TAK
update public.clients set upl1 = true where upl1 is null;
alter table public.clients alter column upl1 set default true;
