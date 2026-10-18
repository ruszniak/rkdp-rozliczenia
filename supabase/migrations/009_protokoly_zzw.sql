-- 009: protokoły zwyczajnych zgromadzeń wspólników (zatwierdzenie sprawozdania finansowego) – RKDP
create table if not exists public.rkdp_protocols (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  period_to     date,
  meeting_date  date,
  params        jsonb not null default '{}'::jsonb,   -- wspólnicy, zarząd, kwoty, warianty uchwał
  created_by    uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rkdp_protocols_client_idx on public.rkdp_protocols (client_id, period_to desc);

alter table public.rkdp_protocols enable row level security;

-- widzi i zapisuje każdy, kto widzi klienta w module rozliczeń; usuwa tylko administrator
drop policy if exists rkdp_protocols_select on public.rkdp_protocols;
create policy rkdp_protocols_select on public.rkdp_protocols for select to authenticated
  using ((select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())));
drop policy if exists rkdp_protocols_insert on public.rkdp_protocols;
create policy rkdp_protocols_insert on public.rkdp_protocols for insert to authenticated
  with check ((select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())));
drop policy if exists rkdp_protocols_update on public.rkdp_protocols;
create policy rkdp_protocols_update on public.rkdp_protocols for update to authenticated
  using ((select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())))
  with check ((select public.has_module('rozliczenia')) and ((select public.has_full_access()) or client_id in (select public.visible_client_ids())));
drop policy if exists rkdp_protocols_delete on public.rkdp_protocols;
create policy rkdp_protocols_delete on public.rkdp_protocols for delete to authenticated using ((select public.is_admin()));

grant select, insert, update, delete on public.rkdp_protocols to authenticated;

drop trigger if exists rkdp_protocols_touch on public.rkdp_protocols;
create trigger rkdp_protocols_touch before update on public.rkdp_protocols for each row execute function public.touch_row();
