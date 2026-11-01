-- „Biuro ma uprawnienia w KSeF”: domyślnie NIE (uzupełnienie pustych + domyślna wartość)
update public.clients set ksef_access = false where ksef_access is null;
alter table public.clients alter column ksef_access set default false;
