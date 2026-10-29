-- 029: wiadomość przygotowana w aplikacji i otwarta do wysłania w Gmailu (ślad w historii klienta)
alter table public.client_messages drop constraint if exists client_messages_status_check;
alter table public.client_messages add constraint client_messages_status_check check (status in ('wyslano', 'blad', 'gmail'));
drop policy if exists cmsg_insert on public.client_messages;
create policy cmsg_insert on public.client_messages for insert to authenticated
  with check (status = 'gmail' and sent_by = (select public.current_member_id()) and (select public.can_see_client(client_id)));
grant insert on public.client_messages to authenticated;
