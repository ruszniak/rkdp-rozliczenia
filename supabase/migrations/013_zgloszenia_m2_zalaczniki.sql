-- 013: zgłoszenia także w M2 TAX (kolumna module) + załączniki do zgłoszeń (zrzuty ekranu, PDF, inne pliki).

-- ---------- moduł: rkdp | m2 ----------
alter table public.rkdp_tickets add column if not exists module text not null default 'rkdp' check (module in ('rkdp','m2'));
alter table public.rkdp_tickets add column if not exists m2_client_id uuid references public.m2_clients(id) on delete set null;
alter table public.rkdp_tickets add column if not exists m2_matter_id uuid references public.m2_matters(id) on delete set null;
create index if not exists rkdp_tickets_module_idx on public.rkdp_tickets (module, status);
alter table public.rkdp_ticket_templates add column if not exists module text not null default 'rkdp' check (module in ('rkdp','m2'));
alter table public.rkdp_ticket_templates add column if not exists m2_client_id uuid references public.m2_clients(id) on delete cascade;
alter table public.rkdp_ticket_templates add column if not exists m2_matter_id uuid references public.m2_matters(id) on delete cascade;

-- kto widzi zgłoszenie: RKDP – jak dotąd; M2 TAX – każdy z modułem Doradztwo
create or replace function public.can_see_ticket(t public.rkdp_tickets) returns boolean
language sql stable set search_path = public as $$
  select case when t.module = 'm2' then public.has_module('doradztwo')
    else public.has_module('rozliczenia') and (
      public.has_full_access()
      or t.created_by = public.current_member_id()
      or t.assignee_id = public.current_member_id()
      or (t.client_id is not null and t.client_id in (select public.visible_client_ids())))
  end
$$;

drop policy if exists rkdp_tickets_insert on public.rkdp_tickets;
create policy rkdp_tickets_insert on public.rkdp_tickets for insert to authenticated
  with check (created_by = (select public.current_member_id())
    and ((module = 'rkdp' and (select public.has_module('rozliczenia'))) or (module = 'm2' and (select public.has_module('doradztwo')))));

drop policy if exists rkdp_tt_select on public.rkdp_ticket_templates;
create policy rkdp_tt_select on public.rkdp_ticket_templates for select to authenticated using (
  case when module = 'm2' then (select public.has_module('doradztwo'))
  else (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or created_by = (select public.current_member_id())
    or assignee_id = (select public.current_member_id()) or (client_id is not null and client_id in (select public.visible_client_ids()))) end);
drop policy if exists rkdp_tt_insert on public.rkdp_ticket_templates;
create policy rkdp_tt_insert on public.rkdp_ticket_templates for insert to authenticated
  with check (created_by = (select public.current_member_id())
    and ((module = 'rkdp' and (select public.has_module('rozliczenia'))) or (module = 'm2' and (select public.has_module('doradztwo')))));
drop policy if exists rkdp_tt_update on public.rkdp_ticket_templates;
create policy rkdp_tt_update on public.rkdp_ticket_templates for update to authenticated
  using ((module = 'm2' and (select public.has_module('doradztwo'))) or (select public.has_full_access()) or created_by = (select public.current_member_id()))
  with check ((module = 'm2' and (select public.has_module('doradztwo'))) or (select public.has_full_access()) or created_by = (select public.current_member_id()));

-- generowanie zadań cyklicznych dla obu modułów (każdy tworzy zgłoszenia ze swojego modułu)
create or replace function public.rkdp_generate_recurring() returns int
language plpgsql security definer set search_path = public as $$
declare
  t record; n int := 0; k int;
  can_rkdp boolean := public.has_module('rozliczenia');
  can_m2 boolean := public.has_module('doradztwo');
begin
  if public.current_member_id() is null or not (can_rkdp or can_m2) then return 0; end if;
  for t in select * from rkdp_ticket_templates
            where active and next_due is not null and next_due - lead_days <= current_date
              and ((module = 'rkdp' and can_rkdp) or (module = 'm2' and can_m2))
            for update skip locked loop
    k := 0;
    while t.next_due is not null and t.next_due - t.lead_days <= current_date and k < 3 loop
      if not exists (select 1 from rkdp_tickets where template_id = t.id and due_date = t.next_due) then
        insert into rkdp_tickets(module, title, description, client_id, m2_client_id, m2_matter_id, category, priority, assignee_id, due_date, source, created_by, template_id)
        values (t.module, t.title, t.description, t.client_id, t.m2_client_id, t.m2_matter_id, t.category, t.priority, t.assignee_id, t.next_due, 'cykliczne', coalesce(t.created_by, t.assignee_id), t.id);
        n := n + 1;
      end if;
      t.last_created := t.next_due;
      t.next_due := public.rkdp_next_due(t.frequency, t.due_day, t.due_month, t.next_due);
      k := k + 1;
    end loop;
    while t.next_due is not null and t.next_due < current_date loop
      t.next_due := public.rkdp_next_due(t.frequency, t.due_day, t.due_month, t.next_due);
    end loop;
    update rkdp_ticket_templates set next_due = t.next_due, last_created = t.last_created where id = t.id;
  end loop;
  return n;
end $$;
revoke execute on function public.rkdp_generate_recurring() from public, anon;
grant execute on function public.rkdp_generate_recurring() to authenticated;

-- ---------- załączniki ----------
create table if not exists public.rkdp_ticket_files (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.rkdp_tickets(id) on delete cascade,
  path        text not null unique,          -- <ticket_id>/<uuid>-<nazwa>
  name        text not null,
  mime        text,
  size        bigint,
  uploaded_by uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at  timestamptz not null default now()
);
create index if not exists rkdp_ticket_files_ticket_idx on public.rkdp_ticket_files (ticket_id, created_at);
alter table public.rkdp_ticket_files enable row level security;
drop policy if exists rkdp_tf_select on public.rkdp_ticket_files;
create policy rkdp_tf_select on public.rkdp_ticket_files for select to authenticated
  using (exists (select 1 from public.rkdp_tickets t where t.id = ticket_id));
drop policy if exists rkdp_tf_insert on public.rkdp_ticket_files;
create policy rkdp_tf_insert on public.rkdp_ticket_files for insert to authenticated
  with check (uploaded_by = (select public.current_member_id()) and exists (select 1 from public.rkdp_tickets t where t.id = ticket_id)
    and path like ticket_id::text || '/%');
drop policy if exists rkdp_tf_delete on public.rkdp_ticket_files;
create policy rkdp_tf_delete on public.rkdp_ticket_files for delete to authenticated
  using (uploaded_by = (select public.current_member_id()) or (select public.is_admin()));
grant select, insert, delete on public.rkdp_ticket_files to authenticated;

-- prywatny schowek plików (max 25 MB na plik); dostęp tylko do plików zgłoszeń, które użytkownik widzi
insert into storage.buckets (id, name, public, file_size_limit)
values ('zgloszenia', 'zgloszenia', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists zgloszenia_read on storage.objects;
create policy zgloszenia_read on storage.objects for select to authenticated
  using (bucket_id = 'zgloszenia' and exists (select 1 from public.rkdp_tickets t where t.id::text = (storage.foldername(name))[1]));
drop policy if exists zgloszenia_upload on storage.objects;
create policy zgloszenia_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'zgloszenia' and (select public.current_member_id()) is not null
    and exists (select 1 from public.rkdp_tickets t where t.id::text = (storage.foldername(name))[1]));
drop policy if exists zgloszenia_delete on storage.objects;
create policy zgloszenia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'zgloszenia' and (owner_id = (select auth.uid())::text or (select public.is_admin())));
