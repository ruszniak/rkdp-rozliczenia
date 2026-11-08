-- płatności za konsultacje (Przelewy24, konto M2 TAX) – płatność dobrowolna: po umówieniu, z e-maila albo z linku po spotkaniu
-- ceny brutto przy rodzaju spotkania: osobno dla rezerwacji ze strony RKDP (i linku) i ze strony M2 TAX
alter table public.meeting_types add column if not exists price_rkdp numeric(10,2) not null default 0;
alter table public.meeting_types add column if not exists price_m2tax numeric(10,2) not null default 0;
-- cena konkretnego spotkania (ustalana przy rezerwacji, zespół może ją zmienić przed wysłaniem linku) i akceptacja regulaminu
alter table public.meetings add column if not exists price numeric(10,2) not null default 0;
alter table public.meetings add column if not exists paid_at timestamptz;
alter table public.meetings add column if not exists terms_accepted_at timestamptz;

create table if not exists public.meeting_payments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id),
  amount numeric(10,2) not null,
  session_id text not null unique,
  p24_token text,
  order_id bigint,
  method_id int,
  status text not null default 'nowa' check (status in ('nowa', 'oplacona', 'blad')),
  email text,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists meeting_payments_meeting on public.meeting_payments(meeting_id);
alter table public.meeting_payments enable row level security;
create policy mp_read on public.meeting_payments for select to authenticated using (public.can_see_meeting_notes());

-- ceny: online 300 zł (RKDP) / 400 zł (M2 TAX), stacjonarnie 400 zł; spotkanie bezpłatne 0 zł
update public.meeting_types set price_rkdp = 300, price_m2tax = 400 where mode = 'meet' and duration_min >= 30;
update public.meeting_types set price_rkdp = 400, price_m2tax = 400 where mode = 'office';
