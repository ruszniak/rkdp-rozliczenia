-- Forma prawna: fundacja rodzinna (tabela spółek kapitałowych, pełna księgowość)
alter table public.clients drop constraint clients_legal_form_check;
alter table public.clients add constraint clients_legal_form_check check (legal_form = any (array['jdg','spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa','spzoo','spolka_akcyjna','fundacja_rodzinna','fundacja_stowarzyszenie','wspolnota','inna']));
create or replace function public.client_section(c clients) returns text language sql immutable set search_path to 'public' as $function$
  select case
    when c.legal_form in ('spzoo','spolka_akcyjna','fundacja_rodzinna') then 'kapitalowe'
    when c.legal_form in ('jdg','spolka_cywilna','spolka_jawna','spolka_partnerska','spolka_komandytowa') then 'osobowe'
    when c.bookkeeping = 'pelna' then 'kapitalowe'
    else 'osobowe' end
$function$;
