-- E-maile o zleceniach: pracownik może je wyłączyć (Mój profil), gdy ma działające powiadomienia push
alter table public.member_profiles add column if not exists zl_email boolean not null default true;
create or replace function public.set_zl_email(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_member_id();
begin
  if me is null then raise exception 'Brak dostępu'; end if;
  insert into public.member_profiles (member_id, zl_email) values (me, p_on)
  on conflict (member_id) do update set zl_email = excluded.zl_email, updated_at = now();
end $$;
revoke execute on function public.set_zl_email(boolean) from public, anon;
grant execute on function public.set_zl_email(boolean) to authenticated;
