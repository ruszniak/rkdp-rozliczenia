-- Wysyłka wzoru umowy e-mailem także dla klientów modułu doradztwa (m2_clients)
alter table public.doc_links add column if not exists m2_client_id uuid references public.m2_clients(id) on delete cascade;
comment on column public.doc_links.m2_client_id is 'Klient z modułu doradztwa (M2 TAX / umowy doradcze RKDP) – wysyłka wzoru umowy e-mailem';
