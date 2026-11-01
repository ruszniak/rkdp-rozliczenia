-- 043: Kwoty do zapłaty dla klienta (VAT, PIT/CIT, ZUS, PIT-4): kwota i termin przy kratce, rachunki klienta,
-- wysyłka jednego e-maila z kwotami (rodzaj wiadomości „kwoty”) i odhaczenie kratek.
alter table public.checklist_entries add column if not exists amount numeric(14,2);
alter table public.checklist_entries add column if not exists due_date date;
alter table public.clients add column if not exists acc_tax text check (acc_tax is null or length(acc_tax) <= 40);   -- mikrorachunek podatkowy
alter table public.clients add column if not exists acc_zus text check (acc_zus is null or length(acc_zus) <= 40);   -- rachunek składkowy ZUS (NRS)
alter table public.client_messages drop constraint if exists client_messages_kind_check;
alter table public.client_messages add constraint client_messages_kind_check check (kind in ('ksef', 'wyciag', 'dokumenty', 'informacja', 'kwoty'));
