-- Godziny i dni powiadomień (Mój profil) + kolejka do wysyłki zbiorczej. Zastosowano jako migracje "godziny_powiadomien" i "godziny_powiadomien_anon".
alter table public.member_profiles add column if not exists notify_window jsonb; -- { on, from 'HH:MM', to 'HH:MM', days [1..7] } (Europe/Warsaw)
create table if not exists public.notify_queue (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  channel text not null check (channel in ('push', 'mail')),
  category text, title text not null, body text, url text, html text,
  created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists notify_queue_pending on public.notify_queue (channel, member_id) where sent_at is null;
alter table public.notify_queue enable row level security;
-- funkcja set_notify_window(jsonb) – walidacja godzin i dni, zapis do member_profiles.notify_window (pełna treść w bazie)
-- cron 'notify-flush' co 10 min: push_call {"event":"flush"} i edge_call('mail', {"action":"flush"}), gdy kolejka niepusta
