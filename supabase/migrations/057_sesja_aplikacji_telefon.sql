-- Aplikacja zainstalowana na telefonie (PWA): sesja nie wygasa po 4 h bezczynności, tylko po 30 dniach
alter table public.auth_verified_sessions add column if not exists app_mode boolean not null default false;
create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.id
    from public.team_members m
    join public.auth_verified_sessions s on s.member_id = m.id
   where m.email = public.current_email() and m.active
     and s.session_id = public.jwt_session_id()
     and s.last_seen > now() - case when s.app_mode then interval '30 days'
                                    else make_interval(mins => public.setting_int('session_idle_minutes', 240)) end
$$;
create or replace function public.auth_app_session() returns boolean
language sql security definer set search_path = public as $$
  with u as (
    update public.auth_verified_sessions s set app_mode = true, last_seen = now()
     where s.session_id = public.jwt_session_id() and s.member_id = public.current_member_id()
    returning 1)
  select exists (select 1 from u)
$$;
revoke execute on function public.auth_app_session() from public, anon;
grant execute on function public.auth_app_session() to authenticated;
