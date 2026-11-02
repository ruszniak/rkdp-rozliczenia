-- Kwoty do zapłaty: dodatkowe pozycje (np. podział kwoty, osobne płatności) zapamiętane dla klienta i miesiąca. Zastosowano jako "kwoty_dodatkowe_pozycje".
create table if not exists public.amount_extras (
  client_id uuid not null references public.clients(id) on delete cascade,
  period date not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default public.current_member_id(),
  primary key (client_id, period)
);
alter table public.amount_extras enable row level security;
create policy ae_select on public.amount_extras for select to authenticated using ((select has_full_access()) or client_id in (select visible_client_ids()));
create policy ae_insert on public.amount_extras for insert to authenticated with check ((select has_full_access()) or client_id in (select visible_client_ids()));
create policy ae_update on public.amount_extras for update to authenticated using ((select has_full_access()) or client_id in (select visible_client_ids())) with check ((select has_full_access()) or client_id in (select visible_client_ids()));
