-- Zadania od biur (zlecenia.m2_client_id): e-maile przez funkcję „partner-mail” (teksty dla biura i doradcy), push jak dotąd.
create or replace function public.zlecenie_notify(p_id uuid, p_ev text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare office boolean;
begin
  perform public.push_call(jsonb_build_object('event', 'zlecenie', 'id', p_id, 'ev', p_ev, 'actor', public.current_member_id()));
  select m2_client_id is not null into office from public.zlecenia where id = p_id;
  if coalesce(office, false) then
    if p_ev in ('nowe', 'pytanie', 'zgloszone', 'poprawka', 'odpowiedz', 'zaakceptowane', 'zamkniete', 'anulowane') then
      perform public.edge_call('partner-mail', jsonb_build_object('id', p_id, 'ev', p_ev, 'actor', public.current_member_id()));
    end if;
  elsif p_ev in ('nowe', 'pytanie', 'zgloszone', 'poprawka', 'odpowiedz', 'zaakceptowane', 'zamkniete', 'anulowane') then
    perform public.edge_call('mail', jsonb_build_object('action', 'zlecenie', 'id', p_id, 'ev', p_ev, 'actor', public.current_member_id()));
  end if;
exception when others then null;
end $function$;
