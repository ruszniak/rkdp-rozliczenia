-- 031: link do podglądu wyniku (np. kalkulatora formy opodatkowania) dla osoby bez dostępu do aplikacji.
-- Zapisujemy wyłącznie treść zestawienia (bloki tekstu/tabel – to samo co w PDF), bez danych z bazy klientów.
-- Odczyt bez logowania tylko przez funkcję shared_doc(token): losowy, nieodgadywalny token, termin ważności, możliwość wyłączenia.

create table if not exists public.shared_docs (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default replace(replace(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+', '-'), '/', '_'),
  kind        text not null default 'kalkulator' check (kind in ('kalkulator')),
  brand       text not null default 'rkdp' check (brand in ('rkdp', 'm2')),
  title       text not null check (length(title) <= 200),
  label       text check (length(label) <= 200),
  blocks      jsonb not null check (jsonb_typeof(blocks) = 'array' and length(blocks::text) <= 200000),
  created_by  uuid not null default public.current_member_id() references public.team_members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  views       int not null default 0,
  last_view_at timestamptz
);
create index if not exists shared_docs_by_idx on public.shared_docs (created_by, created_at desc);
alter table public.shared_docs enable row level security;

drop policy if exists sd_select on public.shared_docs;
create policy sd_select on public.shared_docs for select to authenticated
  using (created_by = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists sd_insert on public.shared_docs;
create policy sd_insert on public.shared_docs for insert to authenticated
  with check (created_by = (select public.current_member_id()));
drop policy if exists sd_update on public.shared_docs;
create policy sd_update on public.shared_docs for update to authenticated
  using (created_by = (select public.current_member_id()) or (select public.is_admin()))
  with check (created_by = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists sd_delete on public.shared_docs;
create policy sd_delete on public.shared_docs for delete to authenticated
  using (created_by = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, update, delete on public.shared_docs to authenticated;

-- po utworzeniu zmienić można tylko ważność, wyłączenie i opis (treść i token są stałe)
create or replace function public.shared_docs_guard() returns trigger language plpgsql as $$
begin
  new.token := old.token; new.blocks := old.blocks; new.title := old.title; new.kind := old.kind; new.brand := old.brand;
  new.created_by := old.created_by; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists shared_docs_guard on public.shared_docs;
create trigger shared_docs_guard before update on public.shared_docs for each row execute function public.shared_docs_guard();

-- publiczny odczyt po tokenie (bez logowania)
create or replace function public.shared_doc(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.shared_docs;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into r from public.shared_docs where token = p_token;
  if not found or r.revoked_at is not null or (r.expires_at is not null and r.expires_at < now()) then return null; end if;
  update public.shared_docs set views = views + 1, last_view_at = now() where id = r.id;
  return jsonb_build_object('title', r.title, 'kind', r.kind, 'brand', r.brand, 'blocks', r.blocks, 'created_at', r.created_at, 'expires_at', r.expires_at);
end $$;
revoke all on function public.shared_doc(text) from public;
grant execute on function public.shared_doc(text) to anon, authenticated;
