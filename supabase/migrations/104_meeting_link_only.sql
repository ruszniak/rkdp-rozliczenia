-- Rodzaje spotkań dostępne tylko z osobistego linku doradcy (/umow/?tylko=…) i spotkania u klienta (adres podaje klient)
alter table public.meeting_types add column if not exists link_only boolean not null default false;
alter table public.meeting_types add column if not exists ask_address boolean not null default false;
comment on column public.meeting_types.link_only is 'Widoczny tylko w osobistym linku doradcy (/umow/?tylko=…), nie na stronach i w zwykłym linku';
comment on column public.meeting_types.ask_address is 'Klient podaje adres spotkania (spotkanie u klienta w siedzibie firmy)';
insert into public.meeting_types (name, duration_min, mode, place, advisors, public, link_only, ask_address, active, sort, description)
select 'Spotkanie u klienta – w siedzibie firmy', 60, 'office', null, array['d862198b-9f25-4eda-9225-731dac263656']::uuid[], false, true, true, true, 5,
  'Przyjadę do Twojej firmy. Adres podasz w następnym kroku.'
where not exists (select 1 from public.meeting_types where ask_address);
