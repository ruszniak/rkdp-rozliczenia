-- Regulamin aplikacji: historia akceptacji (bez możliwości zmiany i usuwania wpisów)
create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.team_members(id),
  email text not null,
  full_name text,
  version text not null,
  content_hash text,
  accepted_at timestamptz not null default now(),
  session_id uuid,
  user_agent text
);
create index if not exists terms_acceptances_member_idx on public.terms_acceptances (member_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;
-- odczyt: własne akceptacje albo administrator; zapis wyłącznie przez funkcję accept_terms; brak update/delete
drop policy if exists terms_select on public.terms_acceptances;
create policy terms_select on public.terms_acceptances for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
revoke insert, update, delete, truncate on public.terms_acceptances from anon, authenticated;

-- data wdrożenia: sesje rozpoczęte wcześniej nie są przerywane – akceptacja przy kolejnym logowaniu
insert into public.app_settings (key, value) values ('terms_rollout_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict (key) do nothing;

-- czy bieżący użytkownik musi teraz zaakceptować regulamin (pierwsze logowanie, co 30 dni, nowa wersja)
create or replace function public.terms_status(p_version text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  mid uuid := public.current_member_id();
  last_acc timestamptz;
  sess_start timestamptz;
  rollout timestamptz;
begin
  if mid is null then return jsonb_build_object('needs', false, 'member', false); end if;
  select max(accepted_at) into last_acc from public.terms_acceptances where member_id = mid and version = p_version;
  select created_at into sess_start from auth.sessions where id = public.jwt_session_id();
  select nullif(value, '')::timestamptz into rollout from public.app_settings where key = 'terms_rollout_at';
  return jsonb_build_object(
    'member', true,
    'last', last_acc,
    'needs', (last_acc is null or last_acc < now() - interval '30 days')
             and not (rollout is not null and sess_start is not null and sess_start < rollout)
  );
end $$;

create or replace function public.accept_terms(p_version text, p_hash text, p_ua text)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare
  m public.team_members%rowtype;
  t timestamptz := now();
begin
  select * into m from public.team_members where id = public.current_member_id();
  if m.id is null then raise exception 'Brak dostępu'; end if;
  insert into public.terms_acceptances (member_id, email, full_name, version, content_hash, accepted_at, session_id, user_agent)
  values (m.id, m.email, m.full_name, left(p_version, 60), left(p_hash, 128), t, public.jwt_session_id(), left(p_ua, 300));
  return t;
end $$;

revoke all on function public.terms_status(text) from public, anon;
revoke all on function public.accept_terms(text, text, text) from public, anon;
grant execute on function public.terms_status(text) to authenticated;
grant execute on function public.accept_terms(text, text, text) to authenticated;
