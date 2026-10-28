-- Powiadomienia push (PWA): urządzenia użytkowników, wyzwalacze dla zgłoszeń i komentarzy, poranny przegląd.
-- Klucze VAPID i sekret wywołań są w Supabase Vault (push_vapid_private_jwk, push_vapid_public, push_hook_secret) – dodawane poza repozytorium.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.team_members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  prefs jsonb not null default '{"zgloszenia": true, "komentarze": true, "terminy": true}',
  created_at timestamptz not null default now(),
  last_success timestamptz,
  fail_count int not null default 0
);
create index if not exists push_subscriptions_member_idx on public.push_subscriptions (member_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (member_id = (select public.current_member_id()));
revoke insert, update, delete, truncate on public.push_subscriptions from anon, authenticated;

-- zapis / zmiana ustawień / usunięcie urządzenia – tylko własnego (urządzenie przejmuje osoba, która się na nim loguje)
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text, p_prefs jsonb default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare mid uuid := public.current_member_id();
begin
  if mid is null then raise exception 'Brak dostępu'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Nieprawidłowy adres powiadomień'; end if;
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, user_agent, prefs)
  values (mid, p_endpoint, left(p_p256dh, 200), left(p_auth, 100), left(p_ua, 300), coalesce(p_prefs, '{"zgloszenia": true, "komentarze": true, "terminy": true}'))
  on conflict (endpoint) do update set member_id = mid, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent,
    prefs = coalesce(p_prefs, public.push_subscriptions.prefs), fail_count = 0;
end $$;

create or replace function public.push_set_prefs(p_endpoint text, p_prefs jsonb)
returns void language sql volatile security definer set search_path = public as $$
  update public.push_subscriptions set prefs = p_prefs where endpoint = p_endpoint and member_id = public.current_member_id();
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language sql volatile security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and member_id = public.current_member_id();
$$;

revoke all on function public.push_subscribe(text, text, text, text, jsonb) from public, anon;
revoke all on function public.push_set_prefs(text, jsonb) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text, jsonb) to authenticated;
grant execute on function public.push_set_prefs(text, jsonb) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;

-- konfiguracja dla funkcji „push” (tylko service_role – klucz prywatny nigdy nie trafia do przeglądarki)
create or replace function public.push_get_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets
   where name in ('push_vapid_private_jwk', 'push_vapid_public', 'push_hook_secret');
$$;
revoke all on function public.push_get_config() from public, anon, authenticated;
grant execute on function public.push_get_config() to service_role;

-- wywołanie funkcji „push” (asynchronicznie przez pg_net – zapis w bazie nie czeka na wysyłkę)
create or replace function public.push_call(p_body jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_hook_secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://iuszfoyttqnkzjzjpzma.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
    body := p_body, timeout_milliseconds := 10000);
exception when others then null; -- powiadomienie nigdy nie blokuje zapisu
end $$;
revoke all on function public.push_call(jsonb) from public, anon, authenticated;

create or replace function public.push_on_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.assignee_id is not null then
    perform public.push_call(jsonb_build_object('event', 'ticket_new', 'id', new.id, 'actor', public.current_member_id()));
  elsif tg_op = 'UPDATE' and new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id then
    perform public.push_call(jsonb_build_object('event', 'ticket_assigned', 'id', new.id, 'actor', public.current_member_id()));
  end if;
  return null;
end $$;
drop trigger if exists push_ticket on public.rkdp_tickets;
create trigger push_ticket after insert or update of assignee_id on public.rkdp_tickets for each row execute function public.push_on_ticket();

create or replace function public.push_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- zmiany pól zapisywane automatycznie (kind = 'zmiana') nie wysyłają powiadomień
  if new.kind in ('komentarz', 'wykonanie') then
    perform public.push_call(jsonb_build_object('event', 'comment', 'id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists push_comment on public.rkdp_ticket_comments;
create trigger push_comment after insert on public.rkdp_ticket_comments for each row execute function public.push_on_comment();

-- poranny przegląd w dni robocze (6:15 UTC = 7:15 zimą / 8:15 latem czasu polskiego)
select cron.unschedule(jobid) from cron.job where jobname = 'push-daily';
select cron.schedule('push-daily', '15 6 * * 1-5', $$ select public.push_call('{"event":"daily"}'::jsonb) $$);
