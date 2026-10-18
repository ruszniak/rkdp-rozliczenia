-- 006: logowanie hasłem + kodem z e-maila, zapamiętane przeglądarki, wylogowanie po bezczynności.
-- Zasada: baza wpuszcza do danych WYŁĄCZNIE sesję potwierdzoną dwoma składnikami
-- (hasło + kod z e-maila albo hasło + zapamiętana przeglądarka). Samo hasło albo sam kod nie daje dostępu.

-- 1. Kolumny w zespole
alter table public.team_members add column if not exists can_set_password boolean not null default true;
alter table public.team_members add column if not exists password_set_at timestamptz;

-- 2. Ustawienia
insert into public.app_settings (key, value) values
  ('session_idle_minutes', '240'),      -- wylogowanie po 4 h bezczynności
  ('device_trust_days', '30')           -- jak długo pamiętamy przeglądarkę
on conflict (key) do nothing;

-- 3. Tabele logowania (bez reguł dla użytkowników – obsługują je wyłącznie funkcje poniżej)
create table if not exists public.auth_verified_sessions (
  session_id  uuid primary key,
  member_id   uuid not null references public.team_members(id) on delete cascade,
  method      text not null,                         -- 'kod' | 'przegladarka' | 'nowe_haslo'
  verified_at timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists auth_verified_sessions_member_idx on public.auth_verified_sessions(member_id);

create table if not exists public.auth_pending (
  member_id  uuid primary key references public.team_members(id) on delete cascade,
  nonce_hash text not null,                          -- wiąże krok 2 z przeglądarką, w której podano hasło
  created_at timestamptz not null default now()
);

create table if not exists public.auth_devices (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.team_members(id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz not null
);
create index if not exists auth_devices_member_idx on public.auth_devices(member_id);

alter table public.auth_verified_sessions enable row level security;
alter table public.auth_pending enable row level security;
alter table public.auth_devices enable row level security;
revoke all on public.auth_verified_sessions, public.auth_pending from anon, authenticated;
revoke all on public.auth_devices from anon;
grant select, delete on public.auth_devices to authenticated;
revoke insert, update on public.auth_devices from authenticated;

-- 4. Pomocnicze odczyty z tokenu
create or replace function public.jwt_session_id() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;

create or replace function public.jwt_has_method(m text) returns boolean
language sql stable as $$
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x where x ->> 'method' = m)
$$;

create or replace function public.setting_int(k text, dflt int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value, '')::int from public.app_settings where key = k), dflt)
$$;

-- osoba z zespołu wg adresu e-mail – BEZ sprawdzania drugiego składnika (tylko do kroków logowania)
create or replace function public.login_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.team_members where email = public.current_email() and active
$$;

-- 5. Tożsamość używana przez WSZYSTKIE reguły dostępu: tylko potwierdzona, nieprzeterminowana sesja
create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.id
    from public.team_members m
    join public.auth_verified_sessions s on s.member_id = m.id
   where m.email = public.current_email() and m.active
     and s.session_id = public.jwt_session_id()
     and s.last_seen > now() - make_interval(mins => public.setting_int('session_idle_minutes', 240))
$$;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from public.team_members where id = public.current_member_id()
$$;

create or replace function public.has_module(m text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where id = public.current_member_id() and m = any(modules))
$$;

-- 6. Kroki logowania
-- Czy ekran logowania ma używać nowego trybu (dostępne bez logowania, nic nie ujawnia)
create or replace function public.login_mode() returns text
language sql immutable as $$ select 'haslo_kod'::text $$;

-- Stan bieżącej sesji – dla aplikacji
create or replace function public.auth_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member',   m.id is not null,
    'verified', public.current_member_id() is not null,
    'can_set_password', coalesce(m.can_set_password, false),
    'password_set', m.password_set_at is not null,
    'idle_minutes', public.setting_int('session_idle_minutes', 240))
  from (select 1) one left join public.team_members m on m.id = public.login_member_id()
$$;

-- Krok 1: hasło poprawne (sesja zalogowana hasłem). Jeśli przeglądarka jest zapamiętana – koniec.
create or replace function public.auth_password_step(p_device_token text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare mid uuid := public.login_member_id(); dev uuid;
  nonce text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if mid is null or not public.jwt_has_method('password') then raise exception 'Brak dostępu'; end if;
  if p_device_token is not null and length(p_device_token) >= 40 then
    select id into dev from public.auth_devices
     where member_id = mid and expires_at > now()
       and token_hash = encode(sha256(convert_to(p_device_token, 'UTF8')), 'hex');
    if dev is not null then
      update public.auth_devices set last_used_at = now() where id = dev;
      insert into public.auth_verified_sessions (session_id, member_id, method)
        values (public.jwt_session_id(), mid, 'przegladarka')
        on conflict (session_id) do update set verified_at = now(), last_seen = now();
      return jsonb_build_object('verified', true);
    end if;
  end if;
  insert into public.auth_pending (member_id, nonce_hash) values (mid, encode(sha256(convert_to(nonce, 'UTF8')), 'hex'))
    on conflict (member_id) do update set nonce_hash = excluded.nonce_hash, created_at = now();
  return jsonb_build_object('verified', false, 'nonce', nonce);
end $$;

-- wspólne: zapamiętanie przeglądarki
create or replace function public.auth_issue_device(mid uuid, p_label text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.auth_devices (member_id, token_hash, label, expires_at)
  values (mid, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), left(p_label, 120),
          now() + make_interval(days => public.setting_int('device_trust_days', 30)));
  return tok;
end $$;
revoke execute on function public.auth_issue_device(uuid, text) from public, anon, authenticated;

-- Krok 2: kod z e-maila poprawny (sesja zalogowana kodem), a hasło podano przed chwilą
create or replace function public.auth_code_step(p_nonce text, p_remember boolean default false, p_label text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare mid uuid := public.login_member_id();
begin
  if mid is null or not public.jwt_has_method('otp') then raise exception 'Brak dostępu'; end if;
  delete from public.auth_pending where member_id = mid and created_at > now() - interval '15 minutes'
     and nonce_hash = encode(sha256(convert_to(coalesce(p_nonce, ''), 'UTF8')), 'hex');
  if not found then raise exception 'Najpierw podaj hasło (albo minęło więcej niż 15 minut).'; end if;
  insert into public.auth_verified_sessions (session_id, member_id, method)
    values (public.jwt_session_id(), mid, 'kod')
    on conflict (session_id) do update set verified_at = now(), last_seen = now();
  return jsonb_build_object('verified', true,
    'device_token', case when p_remember then public.auth_issue_device(mid, p_label) end);
end $$;

-- Pierwsze ustawienie / zmiana hasła za zgodą administratora: kod z e-maila + nowe hasło ustawione przed chwilą
create or replace function public.auth_setup_step(p_remember boolean default false, p_label text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare mid uuid := public.login_member_id();
begin
  if mid is null or not public.jwt_has_method('otp') then raise exception 'Brak dostępu'; end if;
  -- hasło musiało zostać ustawione przed chwilą i W TEJ sesji (sesja istniała wcześniej niż nowe hasło)
  if not exists (select 1 from public.team_members m join auth.sessions s on s.id = public.jwt_session_id()
                  where m.id = mid and m.password_set_at > now() - interval '10 minutes'
                    and s.created_at <= m.password_set_at) then
    raise exception 'Najpierw ustaw hasło.';
  end if;
  insert into public.auth_verified_sessions (session_id, member_id, method)
    values (public.jwt_session_id(), mid, 'nowe_haslo')
    on conflict (session_id) do update set verified_at = now(), last_seen = now();
  return jsonb_build_object('verified', true,
    'device_token', case when p_remember then public.auth_issue_device(mid, p_label) end);
end $$;

-- Podtrzymanie sesji przy aktywności (wydłuża tylko sesję, która jeszcze nie wygasła)
create or replace function public.auth_touch() returns boolean
language sql volatile security definer set search_path = public as $$
  with u as (
    update public.auth_verified_sessions s set last_seen = now()
     where s.session_id = public.jwt_session_id() and s.member_id = public.current_member_id()
    returning 1)
  select exists (select 1 from u)
$$;

-- Wylogowanie: unieważnij potwierdzenie sesji (opcjonalnie zapomnij przeglądarkę)
create or replace function public.auth_logout(p_device_token text default null) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.auth_verified_sessions where session_id = public.jwt_session_id();
  delete from public.auth_devices
   where p_device_token is not null and member_id = public.login_member_id()
     and token_hash = encode(sha256(convert_to(p_device_token, 'UTF8')), 'hex');
$$;

-- Administrator: wyloguj wszędzie / zapomnij przeglądarki danej osoby
create or replace function public.admin_revoke_member(p_member uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak dostępu'; end if;
  delete from public.auth_devices where member_id = p_member;
  delete from public.auth_verified_sessions where member_id = p_member and session_id <> public.jwt_session_id();
end $$;

-- Zapamiętane przeglądarki: każdy widzi swoje, administrator wszystkie
drop policy if exists devices_select on public.auth_devices;
create policy devices_select on public.auth_devices for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists devices_delete on public.auth_devices;
create policy devices_delete on public.auth_devices for delete to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));

-- 7. Hasło można ustawić tylko, gdy pozwala na to administrator (domyślnie: raz, przy pierwszym logowaniu).
-- Blokuje też „resetowanie hasła” samym dostępem do skrzynki e-mail.
create or replace function public.guard_password_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare tm public.team_members;
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    select * into tm from public.team_members where email = lower(new.email);
    if tm.id is null or not tm.active or not tm.can_set_password then
      raise exception 'Zmiana hasła wymaga zgody administratora';
    end if;
    update public.team_members set can_set_password = false, password_set_at = now() where id = tm.id;
    delete from public.auth_verified_sessions where member_id = tm.id;  -- nowe hasło = wylogowanie z innych miejsc
    delete from public.auth_devices where member_id = tm.id;
  end if;
  return new;
end $$;
drop trigger if exists guard_password_change on auth.users;
create trigger guard_password_change before update on auth.users
  for each row execute function public.guard_password_change();

-- 8. Uprawnienia do funkcji
revoke execute on function public.login_member_id(), public.auth_state(), public.auth_password_step(text),
  public.auth_code_step(text, boolean, text), public.auth_setup_step(boolean, text), public.auth_touch(),
  public.auth_logout(text), public.admin_revoke_member(uuid), public.setting_int(text, int),
  public.jwt_session_id(), public.jwt_has_method(text) from public, anon;
grant execute on function public.auth_state(), public.auth_password_step(text), public.auth_code_step(text, boolean, text),
  public.auth_setup_step(boolean, text), public.auth_touch(), public.auth_logout(text), public.admin_revoke_member(uuid),
  public.login_member_id(), public.setting_int(text, int), public.jwt_session_id(), public.jwt_has_method(text) to authenticated;
grant execute on function public.login_mode() to anon, authenticated;
revoke execute on function public.guard_password_change() from public, anon, authenticated;
