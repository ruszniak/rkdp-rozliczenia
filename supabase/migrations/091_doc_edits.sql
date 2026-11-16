-- Ręcznie poprawiona treść umowy / zlecenia (document.xml) – zapamiętana dla danego dokumentu; „Od nowa” ustawia xml = null
create table if not exists public.doc_edits (
  key text primary key,                 -- np. rkdp:umowa:<client_id>:<wzór>, m2:order:<order_id>, m2:partner:<m2_client_id>
  xml text,
  client_id uuid,
  m2_client_id uuid,
  order_id uuid,
  updated_by uuid default public.current_member_id(),
  updated_at timestamptz not null default now()
);
alter table public.doc_edits enable row level security;
create policy de_select on public.doc_edits for select to authenticated using ((select public.is_staff()));
create policy de_insert on public.doc_edits for insert to authenticated with check ((select public.is_staff()));
create policy de_update on public.doc_edits for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
grant select, insert, update on public.doc_edits to authenticated;
