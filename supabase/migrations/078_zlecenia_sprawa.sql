-- zadanie zespołu może być powiązane ze sprawą M2 TAX (dodawane z sekcji „Terminy” w karcie sprawy)
alter table public.zlecenia add column if not exists matter_id uuid references public.m2_matters(id) on delete set null;
create index if not exists zlecenia_matter_idx on public.zlecenia(matter_id) where matter_id is not null;
