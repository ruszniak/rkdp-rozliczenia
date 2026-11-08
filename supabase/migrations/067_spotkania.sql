-- Umawianie spotkań (zamiast Zoho Bookings): rodzaje spotkań, grafik przyjęć (domyślny + zmiany na dni),
-- spotkania z klientami i prywatne. Zapis wyłącznie przez funkcję „spotkania” (rola serwisowa);
-- zespół czyta przez RLS. Nakładanie się spotkań tej samej osoby blokuje baza (exclusion constraint).
create extension if not exists btree_gist;

create table if not exists public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min int not null check (duration_min between 10 and 480),
  mode text not null default 'meet' check (mode in ('meet', 'office', 'phone')),
  place text,
  map_url text,
  advisors uuid[] not null default '{}',
  public boolean not null default true,
  active boolean not null default true,
  sort int not null default 0,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_hours (
  member_id uuid not null references public.team_members(id),
  weekday smallint not null check (weekday between 1 and 7),
  ranges jsonb not null default '[]'::jsonb,           -- [["09:00","17:00"], ...]
  primary key (member_id, weekday)
);

create table if not exists public.booking_days (
  member_id uuid not null references public.team_members(id),
  day date not null,
  ranges jsonb not null default '[]'::jsonb,           -- [] = nie przyjmuje tego dnia
  note text,
  updated_at timestamptz not null default now(),
  primary key (member_id, day)
);

create table if not exists public.booking_settings (
  id int primary key default 1 check (id = 1),
  min_notice_h int not null default 12,
  max_days int not null default 28,
  step_min int not null default 30,
  buffer_min int not null default 10,
  max_per_day int not null default 6,
  from_name text not null default 'Spotkanie z Doradcą Podatkowym',
  from_email text not null default 'app@ruszniak.io',
  updated_at timestamptz not null default now()
);
insert into public.booking_settings (id) values (1) on conflict do nothing;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  type_id uuid references public.meeting_types(id),
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  source text not null default 'app' check (source in ('www', 'app')),
  private boolean not null default false,
  mode text,
  place text,
  meet_url text,
  client_name text,
  client_email text,
  client_phone text,
  topic text,
  client_id uuid,
  m2_client_id uuid,
  matter_id uuid,
  notify_client boolean not null default true,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  gcal jsonb not null default '{}'::jsonb,
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_start_idx on public.meetings (start_at);
create index if not exists meetings_client_idx on public.meetings (client_id);
create index if not exists meetings_m2client_idx on public.meetings (m2_client_id);

create table if not exists public.meeting_members (
  meeting_id uuid not null references public.meetings(id),
  member_id uuid not null references public.team_members(id),
  during tstzrange not null,
  active boolean not null default true,
  primary key (meeting_id, member_id),
  constraint meeting_members_no_overlap exclude using gist (member_id with =, during with &&) where (active)
);

alter table public.meeting_types enable row level security;
alter table public.booking_hours enable row level security;
alter table public.booking_days enable row level security;
alter table public.booking_settings enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_members enable row level security;

-- odczyt: każdy aktywny członek zespołu (rodzaje, grafik, ustawienia)
create policy mt_read on public.meeting_types for select to authenticated using (public.current_member_id() is not null);
create policy mt_admin on public.meeting_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bs_read on public.booking_settings for select to authenticated using (public.current_member_id() is not null);
create policy bs_admin on public.booking_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bh_read on public.booking_hours for select to authenticated using (public.current_member_id() is not null);
create policy bh_write on public.booking_hours for all to authenticated
  using (member_id = public.current_member_id() or public.is_admin()) with check (member_id = public.current_member_id() or public.is_admin());
create policy bd_read on public.booking_days for select to authenticated using (public.current_member_id() is not null);
create policy bd_write on public.booking_days for all to authenticated
  using (member_id = public.current_member_id() or public.is_admin()) with check (member_id = public.current_member_id() or public.is_admin());

-- spotkania: uczestnicy i twórca zawsze; spotkania z klientami (nie prywatne) – osoby z pełnym dostępem i administrator
create or replace function public.meeting_visible(p_id uuid, p_private boolean, p_created_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null and (
    p_created_by = public.current_member_id()
    or exists (select 1 from public.meeting_members mm where mm.meeting_id = p_id and mm.member_id = public.current_member_id())
    or (not p_private and (public.is_admin() or public.has_full_access())));
$$;
create policy mtg_read on public.meetings for select to authenticated using (public.meeting_visible(id, private, created_by));
create policy mm_read on public.meeting_members for select to authenticated using (public.current_member_id() is not null);

-- dane startowe: rodzaje spotkań jak w Zoho, grafik pn–pt 9–17 dla Michała i Marcina
do $$
declare adv uuid[];
begin
  select array_agg(id) into adv from public.team_members where email in ('michal@ruszniak.io', 'marcin.otreba@m2tax.pl');
  if not exists (select 1 from public.meeting_types) then
    insert into public.meeting_types (name, duration_min, mode, place, map_url, advisors, sort, description) values
      ('Spotkanie bezpłatne (20 min)', 20, 'meet', null, null, adv, 1, 'Krótka rozmowa online – poznamy sprawę i powiemy, jak możemy pomóc.'),
      ('Spotkanie online', 60, 'meet', null, null, adv, 2, 'Konsultacja przez Google Meet.'),
      ('Spotkanie stacjonarne – Jagodno', 60, 'office', 'RKDP Doradztwo Podatkowe, ul. Beaty Artemskiej 11/44, 52-234 Wrocław', 'https://share.google/5BBdhpvFsxwc1o3Oj', adv, 3, 'Spotkanie w kancelarii na Jagodnie.'),
      ('Spotkanie stacjonarne – Zwycięska', 60, 'office', 'ul. Zwycięska 3/21, 53-033 Wrocław', 'https://www.google.com/maps/search/?api=1&query=Zwyci%C4%99ska+3%2F21+53-033+Wroc%C5%82aw', adv, 4, 'Spotkanie w biurze przy ul. Zwycięskiej.');
  end if;
  insert into public.booking_hours (member_id, weekday, ranges)
    select m, d, '[["09:00","17:00"]]'::jsonb from unnest(adv) m, generate_series(1, 5) d
    on conflict do nothing;
end $$;

-- przypomnienia dzień przed spotkaniem (co 15 min, tylko gdy jest co wysłać)
select cron.schedule('spotkania-przypomnienia', '*/15 * * * *', $c$
  select public.edge_call('spotkania', '{"action":"cron"}'::jsonb)
  where exists (select 1 from public.meetings where status = 'confirmed' and notify_client and client_email is not null
    and reminder_sent_at is null and start_at between now() and now() + interval '25 hours')
$c$);

-- Kalendarz Google: zapamiętane zgody (do umawiania spotkań potrzebny zapis w głównym kalendarzu)
alter table public.gcal_links add column if not exists scopes text;

-- kalendarze doradców: do którego zapisywać spotkania i z którymi sprawdzać konflikty
-- (Michał: michal@ruszniak.io; Marcin: konto kancelaria@m2tax.pl + konflikty z prywatnym kalendarzem)
create table if not exists public.booking_members (
  member_id uuid primary key references public.team_members(id),
  write_calendar text not null default 'primary',
  busy_calendars text[] not null default '{primary}',
  updated_at timestamptz not null default now()
);
alter table public.booking_members enable row level security;
create policy bm_read on public.booking_members for select to authenticated using (public.current_member_id() is not null);
create policy bm_write on public.booking_members for all to authenticated
  using (member_id = public.current_member_id() or public.is_admin()) with check (member_id = public.current_member_id() or public.is_admin());
insert into public.booking_members (member_id, write_calendar, busy_calendars)
  select id, 'primary', case when email = 'marcin.otreba@m2tax.pl' then '{primary,busum78@gmail.com}'::text[] else '{primary}'::text[] end
  from public.team_members where email in ('michal@ruszniak.io', 'marcin.otreba@m2tax.pl')
on conflict do nothing;
