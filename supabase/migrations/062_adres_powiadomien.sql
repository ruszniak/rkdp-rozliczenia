-- Własny adres e-mail do powiadomień (Mój profil); puste = adres logowania. Zastosowano jako migracje "adres_powiadomien" i "adres_powiadomien_anon".
alter table public.member_profiles add column if not exists notify_email text;
create or replace function public.set_notify_email(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_member_id(); e text := lower(nullif(trim(coalesce(p_email, '')), ''));
begin
  if me is null then raise exception 'Brak dostępu'; end if;
  if e is not null and (length(e) > 200 or e !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$') then raise exception 'Nieprawidłowy adres e-mail'; end if;
  insert into public.member_profiles (member_id, notify_email) values (me, e)
  on conflict (member_id) do update set notify_email = excluded.notify_email, updated_at = now();
  return e;
end $$;
grant execute on function public.set_notify_email(text) to authenticated;
