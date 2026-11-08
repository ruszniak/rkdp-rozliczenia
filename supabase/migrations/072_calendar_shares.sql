-- udostępnienie Kalendarza Google osoby (owner) innym w aplikacji (viewer) – np. kalendarz Michała dla Kuby, Patrycji i Natalii
create table if not exists public.calendar_shares (
  owner_id uuid not null references public.team_members(id),
  viewer_id uuid not null references public.team_members(id),
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);
alter table public.calendar_shares enable row level security;
create policy cs_read on public.calendar_shares for select to authenticated using (public.is_admin() or owner_id = public.current_member_id() or viewer_id = public.current_member_id());
create policy cs_ins on public.calendar_shares for insert to authenticated with check (public.is_admin() or owner_id = public.current_member_id());
create policy cs_upd on public.calendar_shares for update to authenticated using (public.is_admin() or owner_id = public.current_member_id());
-- (dane: kalendarz Michała dla Jakuba, Natalii i Patrycji – wstawione przy wdrożeniu)
