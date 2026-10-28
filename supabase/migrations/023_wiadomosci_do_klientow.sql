-- 023: wiadomości e-mail do klientów wysyłane z aplikacji (KSeF/Saldeo, wyciągi bankowe, inne dokumenty).
-- Wysyłka z adresu kancelaria@rkdp.pl (alias konta Google Workspace michal@ruszniak.io) przez Gmail API, podpis osoby wysyłającej.

create table if not exists public.client_messages (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  kind       text not null check (kind in ('ksef', 'wyciag', 'dokumenty')),
  period     date,
  email      text not null,
  subject    text not null,
  status     text not null default 'wyslano' check (status in ('wyslano', 'blad')),
  error      text,
  sent_by    uuid references public.team_members(id) on delete set null,
  sent_at    timestamptz not null default now()
);
create index if not exists client_messages_idx on public.client_messages (client_id, sent_at desc);
alter table public.client_messages enable row level security;
drop policy if exists cmsg_select on public.client_messages;
create policy cmsg_select on public.client_messages for select to authenticated using ((select public.can_see_client(client_id)));
grant select on public.client_messages to authenticated;

-- konto Workspace, w imieniu którego działa wysyłka (delegacja domeny), i adres nadawcy (alias tego konta)
insert into public.app_settings (key, value) values ('mail_sender', 'michal@ruszniak.io')
  on conflict (key) do update set value = excluded.value where coalesce(public.app_settings.value, '') = '';
insert into public.app_settings (key, value) values ('mail_from', 'kancelaria@rkdp.pl') on conflict (key) do nothing;
