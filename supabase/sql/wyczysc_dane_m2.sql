-- Czyszczenie danych testowych M2 TAX (Doradztwo) przed startem pracy.
-- USUWA: klientów M2, kontakty, zlecenia, sprawy, terminy, dziennik, godziny,
--        oferty M2 TAX, zgłoszenia M2 (z komentarzami i załącznikami), zgłoszenia cykliczne M2.
-- ZOSTAJE: zespół i uprawnienia, ustawienia (kalendarz Google, Zoho), podpisujący (PPS-1),
--          wszystkie dane RKDP (klienci, rozliczenia, zgłoszenia RKDP, oferty RKDP, protokoły).
-- Numeracja zleceń, spraw i ofert M2 zacznie się od nowa (od 001).

begin;

-- zgłoszenia M2 (komentarze i wpisy o załącznikach znikają razem z nimi)
delete from public.rkdp_ticket_comments where ticket_id in (select id from public.rkdp_tickets where module = 'm2');
delete from public.rkdp_ticket_files    where ticket_id in (select id from public.rkdp_tickets where module = 'm2');
delete from public.rkdp_tickets          where module = 'm2';
delete from public.rkdp_ticket_templates where module = 'm2';

-- oferty M2 TAX
delete from public.offers where brand = 'm2';

-- sprawy i wszystko, co do nich należy
delete from public.m2_time;
delete from public.m2_journal;
delete from public.m2_deadlines;
delete from public.m2_matters;
delete from public.m2_orders;

-- klienci M2 i ich osoby kontaktowe
delete from public.m2_contacts;
delete from public.m2_clients;

-- kontrola: wszystkie liczby powinny być 0
select 'klienci' co, count(*) from public.m2_clients
union all select 'zlecenia', count(*) from public.m2_orders
union all select 'sprawy', count(*) from public.m2_matters
union all select 'terminy', count(*) from public.m2_deadlines
union all select 'dziennik', count(*) from public.m2_journal
union all select 'godziny', count(*) from public.m2_time
union all select 'oferty M2', count(*) from public.offers where brand = 'm2'
union all select 'zgłoszenia M2', count(*) from public.rkdp_tickets where module = 'm2';

commit;
