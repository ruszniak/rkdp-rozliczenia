-- 045: licznik czasu przy sprawie M2 TAX (po zatrzymaniu zapisuje wpis w m2_time sprawy)
alter table public.time_entries add column if not exists m2_matter_id uuid references public.m2_matters(id) on delete cascade;
