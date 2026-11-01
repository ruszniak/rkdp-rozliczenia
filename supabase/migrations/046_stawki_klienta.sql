-- Stawki klienta (z faktur): abonament = monthly_fee, limit dokumentów, dokument nadwyżkowy, obsługa pracownika, usługi dodatkowe
alter table public.clients
  add column if not exists fee_docs integer,
  add column if not exists fee_extra_doc numeric(10,2),
  add column if not exists fee_employee numeric(10,2),
  add column if not exists fee_extras text;
comment on column public.clients.fee_docs is 'Liczba dokumentów w abonamencie';
comment on column public.clients.fee_extra_doc is 'Dokument nadwyżkowy – zł netto / szt.';
comment on column public.clients.fee_employee is 'Obsługa pracownika – zł netto / os.';
comment on column public.clients.fee_extras is 'Usługi dodatkowe (opis i kwoty netto)';
