-- 038: (1) kolumna „LP wysłana” w kadrach (lista płac wysłana klientowi),
--      (2) historia ZUS klienta: rodzaje składek / kody tytułu ubezpieczenia z datami oraz wakacje składkowe.

-- (1) nowa kratka w tabeli Kadry i ZUS – tylko dla pracodawców (reguła payroll)
insert into public.task_types (code, label, sort, rule, area, applies_to, description)
values ('lp_wyslana', 'LP wysłana', 125, 'payroll', 'kadry', 'all', 'Czy lista płac została wysłana klientowi')
on conflict (code) do update set label = excluded.label, sort = excluded.sort, rule = excluded.rule,
  area = excluded.area, applies_to = excluded.applies_to, description = excluded.description, active = true;

-- bieżące miesiące (od września 2026): kratka jak PIT-4 – „nie dotyczy” tam, gdzie PIT-4 nie dotyczy, inaczej „do zrobienia”
insert into public.checklist_entries (client_id, period, task_code, status)
select client_id, period, 'lp_wyslana', case when status = 'na' then 'na' else 'todo' end
  from public.checklist_entries
 where task_code = 'pit4' and period >= date '2026-09-01'
on conflict (client_id, period, task_code) do nothing;

-- (2) historia ZUS klienta
create table if not exists public.client_zus (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  kind        text not null check (kind in ('skladki', 'wakacje')),
  zus_type    text,                    -- dla 'skladki': klucz jak clients.zus_type (ulga_na_start, preferencyjny, maly_zus_plus, pelny…)
  code        text check (code is null or length(code) <= 20),   -- kod tytułu ubezpieczenia, np. 05 90 00
  valid_from  date not null,           -- 'wakacje': pierwszy dzień miesiąca wakacji
  valid_to    date,                    -- 'skladki': koniec okresu (puste = trwa)
  note        text check (note is null or length(note) <= 500),
  created_by  uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at  timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check (kind <> 'skladki' or zus_type is not null)
);
create index if not exists client_zus_idx on public.client_zus (client_id, valid_from);
create unique index if not exists client_zus_wakacje_rok on public.client_zus (client_id, (extract(year from valid_from))) where kind = 'wakacje';

alter table public.client_zus enable row level security;
create policy cz_select on public.client_zus for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cz_insert on public.client_zus for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cz_update on public.client_zus for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy cz_delete on public.client_zus for delete to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
grant select, insert, update, delete on public.client_zus to authenticated;
