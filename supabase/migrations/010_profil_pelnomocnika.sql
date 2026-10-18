-- 010: „Mój profil” – dane pracownika do pełnomocnictw (UPL-1, PEL, PPS-1), uzupełniane przez niego samego.
-- member_profiles – dane widoczne dla zespołu (trafiają na pełnomocnictwa generowane przez innych),
-- member_private  – PESEL i dokument tożsamości: widzi i zmienia wyłącznie sam pracownik.
create table if not exists public.member_profiles (
  member_id   uuid primary key references public.team_members(id) on delete cascade,
  nip         text,
  ae_address  text,
  phone       text,
  email       text,
  delivery    text not null default 'biuro' check (delivery in ('biuro','wlasny')),
  voiv        text, county text, commune text, street text, house text, flat text, zip text, city text, post text,
  updated_at  timestamptz not null default now()
);
create table if not exists public.member_private (
  member_id   uuid primary key references public.team_members(id) on delete cascade,
  pesel       text check (pesel is null or pesel ~ '^\d{11}$'),
  id_doc      text,
  updated_at  timestamptz not null default now()
);

alter table public.member_profiles enable row level security;
alter table public.member_private enable row level security;

drop policy if exists member_profiles_select on public.member_profiles;
create policy member_profiles_select on public.member_profiles for select to authenticated
  using ((select public.current_member_id()) is not null);
drop policy if exists member_profiles_insert on public.member_profiles;
create policy member_profiles_insert on public.member_profiles for insert to authenticated
  with check (member_id = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists member_profiles_update on public.member_profiles;
create policy member_profiles_update on public.member_profiles for update to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()))
  with check (member_id = (select public.current_member_id()) or (select public.is_admin()));
drop policy if exists member_profiles_delete on public.member_profiles;
create policy member_profiles_delete on public.member_profiles for delete to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));

drop policy if exists member_private_self on public.member_private;
create policy member_private_self on public.member_private for all to authenticated
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));

grant select, insert, update, delete on public.member_profiles, public.member_private to authenticated;

drop trigger if exists member_profiles_touch on public.member_profiles;
create trigger member_profiles_touch before update on public.member_profiles for each row execute function public.touch_row();
drop trigger if exists member_private_touch on public.member_private;
create trigger member_private_touch before update on public.member_private for each row execute function public.touch_row();
