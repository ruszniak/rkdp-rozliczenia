-- Klient M2 TAX: standardowy klient albo partner (biuro rachunkowe w Programie Partner) + wybrany pakiet.
alter table public.m2_clients
  add column if not exists client_type text not null default 'klient' check (client_type in ('klient', 'partner')),
  add column if not exists partner_package text check (partner_package is null or partner_package in ('baza', 'partner', 'plus'));
comment on column public.m2_clients.client_type is 'klient – standardowy klient M2 TAX; partner – biuro rachunkowe w Programie Partner';
