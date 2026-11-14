-- Zamknięcie zadania jako wykonane („Zakończ – wykonane”) i anulowanie: powiadomienie (push + e-mail)
-- do wszystkich osób przy zadaniu poza tą, która to zrobiła – np. zlecający dowiaduje się, że jego zadanie jest zrobione.
create or replace function public.zlecenie_notify(p_id uuid, p_ev text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform public.push_call(jsonb_build_object('event', 'zlecenie', 'id', p_id, 'ev', p_ev, 'actor', public.current_member_id()));
  if p_ev in ('nowe', 'pytanie', 'zgloszone', 'poprawka', 'odpowiedz', 'zaakceptowane', 'zamkniete', 'anulowane') then
    perform public.edge_call('mail', jsonb_build_object('action', 'zlecenie', 'id', p_id, 'ev', p_ev, 'actor', public.current_member_id()));
  end if;
exception when others then null;
end $function$;

create or replace function public.zlecenie_akcja(p_id uuid, p_akcja text, p_tekst text default null::text)
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare z public.zlecenia%rowtype; me uuid := public.current_member_id(); adm boolean; txt text := nullif(trim(coalesce(p_tekst, '')), '');
begin
  select * into z from public.zlecenia where id = p_id for update;
  adm := coalesce(public.is_admin(), false) or coalesce(found and z.created_by = me, false);
  if not found or me is null or (not adm and z.assignee_id <> me) then raise exception 'Brak dostępu do zlecenia'; end if;
  if length(coalesce(txt, '')) > 3000 then raise exception 'Za długi tekst'; end if;

  if p_akcja = 'start' and z.assignee_id = me and z.status in ('nowe', 'pytanie') then
    update public.zlecenia set status = 'w_toku' where id = p_id;
  elsif p_akcja = 'pytanie' and z.assignee_id = me and z.status in ('nowe', 'w_toku') then
    if txt is null then raise exception 'Wpisz pytanie'; end if;
    update public.zlecenia set status = 'pytanie' where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'pytanie', txt);
    perform public.zlecenie_notify(p_id, 'pytanie');
  elsif p_akcja = 'zglos' and z.assignee_id = me and z.status in ('nowe', 'w_toku', 'pytanie') then
    update public.zlecenia set status = 'zgloszone', reported_at = now() where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'zgloszenie', txt);
    perform public.zlecenie_notify(p_id, 'zgloszone');
  elsif p_akcja = 'akceptuj' and adm and z.status = 'zgloszone' then
    update public.zlecenia set status = 'zaakceptowane', accepted_at = now() where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'akceptacja', txt);
    perform public.zlecenie_notify(p_id, 'zaakceptowane');
  elsif p_akcja = 'zakoncz' and adm and z.status in ('nowe', 'w_toku', 'pytanie') then
    -- zamknięcie jako wykonane bez zgłoszenia przez pracownika (np. ustalone ustnie / zrobił sam) – info do pozostałych osób
    update public.zlecenia set status = 'zaakceptowane', accepted_at = now() where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'akceptacja', coalesce(txt, 'Zamknięte jako wykonane'));
    perform public.zlecenie_notify(p_id, 'zamkniete');
  elsif p_akcja = 'popraw' and adm and z.status = 'zgloszone' then
    if txt is null then raise exception 'Napisz, co poprawić'; end if;
    update public.zlecenia set status = 'w_toku', reported_at = null where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'poprawka', txt);
    perform public.zlecenie_notify(p_id, 'poprawka');
  elsif p_akcja = 'odpowiedz' and adm and z.status = 'pytanie' then
    if txt is null then raise exception 'Wpisz odpowiedź'; end if;
    update public.zlecenia set status = 'w_toku' where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'komentarz', txt);
    perform public.zlecenie_notify(p_id, 'odpowiedz');
  elsif p_akcja = 'anuluj' and adm and z.status not in ('zaakceptowane', 'anulowane') then
    update public.zlecenia set status = 'anulowane' where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'status', coalesce(txt, 'Anulowano'));
    perform public.zlecenie_notify(p_id, 'anulowane');
  elsif p_akcja = 'wznow' and adm and z.status in ('zaakceptowane', 'anulowane') then
    update public.zlecenia set status = 'w_toku', accepted_at = null where id = p_id;
    insert into public.zlecenia_wpisy (zlecenie_id, author_id, kind, body) values (p_id, me, 'status', 'Wznowiono');
  else
    raise exception 'Tej czynności nie można teraz wykonać';
  end if;
  return (select status from public.zlecenia where id = p_id);
end $function$;
