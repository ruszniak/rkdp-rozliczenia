-- 036: zbiorcze informacje e-mail do klientów (jedna wiadomość, adresaci w UDW) – historia wysyłek i ślad w rozmowie klienta.
alter table public.client_messages drop constraint if exists client_messages_kind_check;
alter table public.client_messages add constraint client_messages_kind_check check (kind in ('ksef', 'wyciag', 'dokumenty', 'informacja'));

create table if not exists public.mail_broadcasts (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  body        text not null,
  groups      text,                       -- opis wybranych grup (np. „JDG, Sp. z o.o.”) – tylko informacyjnie
  recipients  int not null default 0,     -- liczba adresów e-mail
  clients     int not null default 0,     -- liczba klientów
  failed      int not null default 0,
  status      text not null default 'wyslano' check (status in ('wyslano', 'czesciowo', 'blad', 'test')),
  error       text,
  sent_by     uuid references public.team_members(id) on delete set null,
  sent_at     timestamptz not null default now()
);
alter table public.mail_broadcasts enable row level security;
drop policy if exists mb_select on public.mail_broadcasts;
create policy mb_select on public.mail_broadcasts for select to authenticated
  using ((select public.has_full_access()) or sent_by = (select public.current_member_id()));
grant select on public.mail_broadcasts to authenticated;
-- zapis wyłącznie przez funkcję „mail” (klucz serwisowy)
