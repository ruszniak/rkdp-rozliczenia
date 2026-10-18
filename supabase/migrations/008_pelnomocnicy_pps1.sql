-- 008: dane pełnomocników do formularza PPS-1 (NIP, adres do doręczeń elektronicznych, kontakt)
alter table public.m2_signers add column if not exists nip text;
alter table public.m2_signers add column if not exists ae_address text;
alter table public.m2_signers add column if not exists phone text;
alter table public.m2_signers add column if not exists email text;

update public.m2_signers set nip = '8961578230', ae_address = 'AE:PL-12462-45305-JVUBT-24'
 where full_name = 'Michał Ruszniak' and nip is null;
update public.m2_signers set nip = '8631444830', ae_address = 'AE:PL-54105-17903-ICHAB-25'
 where full_name = 'Marcin Otręba' and nip is null;
