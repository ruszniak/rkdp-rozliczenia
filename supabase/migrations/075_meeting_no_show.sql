-- klient umówił się, nie odwołał i nie przyszedł – oznaczenie przy spotkaniu (po jego rozpoczęciu)
alter table public.meetings add column if not exists no_show boolean not null default false;
alter table public.meetings add column if not exists no_show_at timestamptz;
alter table public.meetings add column if not exists no_show_by uuid references public.team_members(id);

create or replace function public.meeting_mark_no_show(p_meeting uuid, p_value boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare m record;
begin
  select id, private, created_by, start_at, status into m from public.meetings where id = p_meeting;
  if m.id is null or not public.meeting_visible(m.id, m.private, m.created_by) then raise exception 'Brak dostępu do spotkania'; end if;
  if m.private then raise exception 'To spotkanie wewnętrzne – bez klienta'; end if;
  if m.status <> 'confirmed' then raise exception 'Spotkanie zostało odwołane'; end if;
  if p_value and m.start_at > now() then raise exception 'Spotkanie jeszcze się nie zaczęło'; end if;
  update public.meetings set no_show = p_value, no_show_at = case when p_value then now() end,
    no_show_by = case when p_value then public.current_member_id() end, updated_at = now() where id = p_meeting;
end $$;
grant execute on function public.meeting_mark_no_show(uuid, boolean) to authenticated;
