-- 093: wnioski urlopowe. Pracownik składa wniosek (rodzaj, od–do, uwagi), akceptuje administrator
-- albo osoba z attendance_scope dla domeny pracownika (np. Marcin – @m2tax.pl). Po akceptacji dni robocze
-- z wniosku trafiają do listy obecności. Powiadomienia push: nowy wniosek → akceptujący, decyzja → pracownik.

create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.team_members(id) on delete cascade,
  kind          text not null default 'urlop' check (kind in ('urlop','urlop_zadanie','okolicznosciowy','opieka','bezplatny','wolne')),
  date_from     date not null,
  date_to       date not null,
  days          int not null default 0 check (days between 0 and 60),
  note          text check (length(note) <= 1000),
  status        text not null default 'oczekuje' check (status in ('oczekuje','zaakceptowany','odrzucony','wycofany')),
  decided_by    uuid references public.team_members(id) on delete set null,
  decided_at    timestamptz,
  decision_note text check (length(decision_note) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (date_to >= date_from and date_to - date_from <= 90)
);
create index if not exists leave_requests_member_idx on public.leave_requests (member_id, date_from);
create index if not exists leave_requests_status_idx on public.leave_requests (status) where status = 'oczekuje';

create or replace trigger leave_requests_touch before update on public.leave_requests for each row execute function public.touch_row();

-- kto może zaakceptować wniosek danej osoby
create or replace function public.can_decide_leave(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
      or (target <> public.current_member_id() and public.can_see_attendance(target))
$$;
revoke execute on function public.can_decide_leave(uuid) from public, anon;
grant execute on function public.can_decide_leave(uuid) to authenticated;

alter table public.leave_requests enable row level security;
create policy leave_select on public.leave_requests for select to authenticated
  using ((select public.can_see_attendance(member_id)));
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (member_id = (select public.current_member_id()) and status = 'oczekuje' and decided_by is null and decided_at is null);
grant select, insert on public.leave_requests to authenticated;

-- powiadomienie o nowym wniosku
create or replace function public.leave_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_call(jsonb_build_object('event', 'urlop', 'id', new.id, 'ev', 'nowy', 'actor', new.member_id));
  return new;
exception when others then return new;
end $$;
create or replace trigger leave_requests_notify after insert on public.leave_requests for each row execute function public.leave_after_insert();

-- wycofanie własnego wniosku, dopóki czeka na decyzję
create or replace function public.leave_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.leave_requests%rowtype; me uuid := public.current_member_id();
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or r.member_id <> me then raise exception 'Brak dostępu do wniosku'; end if;
  if r.status <> 'oczekuje' then raise exception 'Wniosek ma już decyzję – zmianę uzgodnij z przełożonym'; end if;
  update public.leave_requests set status = 'wycofany' where id = p_id;
  perform public.push_call(jsonb_build_object('event', 'urlop', 'id', p_id, 'ev', 'wycofany', 'actor', me));
end $$;
revoke execute on function public.leave_cancel(uuid) from public, anon;
grant execute on function public.leave_cancel(uuid) to authenticated;

-- decyzja: p_days = dni robocze z wniosku (aplikacja pomija weekendy i święta); zapisywane tylko w zakresie wniosku
create or replace function public.leave_decide(p_id uuid, p_approve boolean, p_note text default null, p_days date[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare r public.leave_requests%rowtype; me uuid := public.current_member_id(); n int := 0;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or me is null or not public.can_decide_leave(r.member_id) then raise exception 'Brak uprawnień do decyzji'; end if;
  if r.status <> 'oczekuje' then raise exception 'Wniosek nie oczekuje na decyzję'; end if;
  update public.leave_requests set status = case when p_approve then 'zaakceptowany' else 'odrzucony' end,
    decided_by = me, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  if p_approve then
    insert into public.attendance (member_id, day, kind, start_time, end_time, break_min, note)
    select r.member_id, d, r.kind, null, null, 0, 'Wniosek urlopowy'
      from unnest(coalesce(p_days, '{}'::date[])) d
     where d between r.date_from and r.date_to and extract(isodow from d) < 6
    on conflict (member_id, day) do update set kind = excluded.kind, start_time = null, end_time = null, break_min = 0, note = excluded.note;
    get diagnostics n = row_count;
  end if;
  perform public.push_call(jsonb_build_object('event', 'urlop', 'id', p_id, 'ev', 'decyzja', 'actor', me));
  return case when p_approve then 'zaakceptowany' else 'odrzucony' end;
end $$;
revoke execute on function public.leave_decide(uuid, boolean, text, date[]) from public, anon;
grant execute on function public.leave_decide(uuid, boolean, text, date[]) to authenticated;
