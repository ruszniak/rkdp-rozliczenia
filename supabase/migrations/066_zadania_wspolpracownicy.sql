-- Zadania: dodatkowe osoby pracujące razem nad zadaniem (zlecenia.helpers). Zastosowano jako "zadania_wspolpracownicy" (+ "_anon").
-- Widoczność (zl_select, zw_select, zw_insert, zl_visible) i kroki (zlecenie_krok) obejmują osoby z helpers.
-- RPC zlecenie_osoby(p_id, p_helpers uuid[]) – zmienia listę (zlecający, wykonujący, administrator), wpis w przebiegu,
-- powiadomienie push i e-mail ('dodany') dla nowo dodanych. Pełna treść funkcji w bazie.
alter table public.zlecenia add column if not exists helpers uuid[] not null default '{}';
create index if not exists zlecenia_helpers_gin on public.zlecenia using gin (helpers);
