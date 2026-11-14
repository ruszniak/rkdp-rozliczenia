-- Podpis przez link także dla zleceń / umów doradczych (klienci M2 TAX i RKDP) oraz pełnomocnictwa ZUS PEL.
-- Klient M2 bez karty RKDP: pliki w koszyku „klienci” pod m2/<id klienta>/ (file_path, signed_path).
alter table public.sign_requests alter column client_id drop not null;
alter table public.sign_requests
  add column if not exists m2_client_id uuid references public.m2_clients(id) on delete cascade,
  add column if not exists order_id uuid references public.m2_orders(id) on delete set null,
  add column if not exists firm text not null default 'rkdp' check (firm in ('rkdp', 'm2')),
  add column if not exists kind text not null default 'umowa' check (kind in ('umowa', 'zlecenie', 'umowa_doradcza', 'pel', 'inne')),
  add column if not exists file_path text,
  add column if not exists signed_path text,
  add column if not exists signed_name text;
alter table public.sign_requests add constraint sign_requests_owner check (client_id is not null or m2_client_id is not null);
create index if not exists sign_requests_order_idx on public.sign_requests(order_id) where order_id is not null;
create index if not exists sign_requests_m2c_idx on public.sign_requests(m2_client_id) where m2_client_id is not null;
alter policy sr_select on public.sign_requests
  using ((select has_full_access()) or client_id in (select visible_client_ids()) or (m2_client_id is not null and m2_client_id in (select id from public.m2_clients)));
alter policy sr_update on public.sign_requests
  using ((select has_full_access()) or client_id in (select visible_client_ids()) or (m2_client_id is not null and m2_client_id in (select id from public.m2_clients)))
  with check ((select has_full_access()) or client_id in (select visible_client_ids()) or (m2_client_id is not null and m2_client_id in (select id from public.m2_clients)));
