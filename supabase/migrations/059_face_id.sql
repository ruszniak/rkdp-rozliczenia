-- Face ID / odcisk palca (passkey, WebAuthn) w aplikacji na telefonie (iPhone, Android):
--  • logowanie twarzą zamiast hasła i kodu z e-maila,
--  • blokada aplikacji – przy każdym uruchomieniu trzeba potwierdzić twarzą.
-- Klucz prywatny zostaje w telefonie (Pęk kluczy iCloud / Menedżer haseł Google); w bazie tylko klucz publiczny.
create table public.passkeys (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,          -- base64url (COSE)
  counter bigint not null default 0,
  transports text[],
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkeys_member on public.passkeys (member_id);
alter table public.passkeys enable row level security;
create policy passkeys_select on public.passkeys for select to authenticated using (member_id = (select current_member_id()) or (select is_admin()));
-- usuwanie przez funkcję „passkey” (akcja remove: właściciel albo administrator)
-- zapis tylko przez funkcję „passkey” (service_role) po sprawdzeniu podpisu
revoke insert, update on public.passkeys from anon, authenticated;
create trigger audit_passkeys after update on public.passkeys for each row execute function public.write_audit();

-- jednorazowe wyzwania (5 minut) i przepustki logowania (3 minuty) – tylko dla funkcji „passkey”
create table public.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.team_members(id) on delete cascade,
  challenge text not null,
  kind text not null check (kind in ('register','login','unlock')),
  created_at timestamptz not null default now()
);
alter table public.passkey_challenges enable row level security;
revoke all on public.passkey_challenges from anon, authenticated;

create table public.passkey_grants (
  token_hash text primary key,
  member_id uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.passkey_grants enable row level security;
revoke all on public.passkey_grants from anon, authenticated;

-- po zalogowaniu twarzą: potwierdzenie sesji (zamiast kroku z kodem z e-maila)
create or replace function public.auth_passkey_step(p_grant text, p_app boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := public.login_member_id();
begin
  if mid is null or public.jwt_session_id() is null then raise exception 'Brak dostępu'; end if;
  update public.passkey_grants set used_at = now()
   where member_id = mid and used_at is null and created_at > now() - interval '3 minutes'
     and token_hash = encode(sha256(convert_to(coalesce(p_grant, ''), 'UTF8')), 'hex');
  if not found then raise exception 'Logowanie twarzą wygasło – spróbuj ponownie.'; end if;
  insert into public.auth_verified_sessions (session_id, member_id, method, app_mode)
    values (public.jwt_session_id(), mid, 'passkey', coalesce(p_app, false))
    on conflict (session_id) do update set verified_at = now(), last_seen = now(), app_mode = excluded.app_mode;
  return jsonb_build_object('verified', true);
end $$;
revoke execute on function public.auth_passkey_step(text, boolean) from public, anon;
grant execute on function public.auth_passkey_step(text, boolean) to authenticated;
