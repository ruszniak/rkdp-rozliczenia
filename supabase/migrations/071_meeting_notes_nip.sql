-- NIP podany przy rezerwacji (opcjonalny)
alter table public.meetings add column if not exists client_nip text;

-- notatki wewnętrzne do spotkania: opis, koszt wizyty, opłacone, faktura (widoczne dla administratorów i osób z pełnym dostępem)
create table if not exists public.meeting_notes (
  meeting_id uuid primary key references public.meetings(id),
  body text,
  fee numeric(10,2),
  paid boolean not null default false,
  paid_method text,
  invoiced boolean not null default false,
  invoice_no text,
  updated_by uuid references public.team_members(id),
  updated_at timestamptz not null default now()
);
alter table public.meeting_notes enable row level security;
create or replace function public.can_see_meeting_notes() returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.current_member_id() is not null and (public.is_admin() or coalesce(public.current_role_name() in ('admin','full'), false)) $$;
create policy mn_read on public.meeting_notes for select to authenticated using (public.can_see_meeting_notes());
create policy mn_ins on public.meeting_notes for insert to authenticated with check (public.can_see_meeting_notes());
create policy mn_upd on public.meeting_notes for update to authenticated using (public.can_see_meeting_notes()) with check (public.can_see_meeting_notes());

-- przypięcie spotkania do klienta (np. po założeniu klienta ze spotkania)
create or replace function public.meeting_link_client(p_meeting uuid, p_client uuid, p_m2_client uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare m record;
begin
  select id, private, created_by into m from public.meetings where id = p_meeting;
  if m.id is null or not public.meeting_visible(m.id, m.private, m.created_by) then raise exception 'Brak dostępu do spotkania'; end if;
  update public.meetings set client_id = coalesce(p_client, client_id), m2_client_id = coalesce(p_m2_client, m2_client_id), updated_at = now() where id = p_meeting;
end $$;
grant execute on function public.meeting_link_client(uuid, uuid, uuid) to authenticated;
