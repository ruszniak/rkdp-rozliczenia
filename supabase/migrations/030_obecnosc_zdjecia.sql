-- 030: lista obecności tylko dla oznaczonych osób + zdjęcia profilowe (miniatury zamiast inicjałów)

-- kto prowadzi listę obecności (ustawia administrator w „Zespół i ustawienia”)
alter table public.team_members add column if not exists attendance boolean not null default false;
update public.team_members set attendance = true
 where lower(email) in ('filip.ditrejnowski@m2tax.pl', 'weronika.rzepkowska@m2tax.pl', 'natalia.piechota2002@gmail.com');

-- zdjęcie profilowe: mała miniatura (ok. 160 px) zapisana jako data:image/… – ładuje się razem z listą zespołu,
-- nie wymaga osobnego magazynu plików ani zmian w polityce bezpieczeństwa treści (img-src data:)
alter table public.team_members add column if not exists avatar text
  check (avatar is null or (avatar like 'data:image/%' and length(avatar) <= 150000));

-- każdy może ustawić / usunąć tylko własne zdjęcie (pozostałe pola zespołu zmienia wyłącznie administrator)
create or replace function public.set_my_avatar(p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_member_id();
begin
  if me is null then raise exception 'Brak dostępu'; end if;
  if p_avatar is not null and (p_avatar not like 'data:image/%' or length(p_avatar) > 150000) then
    raise exception 'Nieprawidłowe zdjęcie (maks. ok. 100 KB)';
  end if;
  update public.team_members set avatar = p_avatar where id = me;
end $$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
