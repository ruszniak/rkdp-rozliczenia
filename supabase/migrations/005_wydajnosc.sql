-- 005: wydajność – indeksy kluczy obcych, reguły RLS liczone raz na zapytanie

-- Indeksy
create index if not exists checklist_entries_assignee_idx on public.checklist_entries(assignee_id);
create index if not exists checklist_entries_task_idx     on public.checklist_entries(task_code);
create index if not exists clients_accountant_idx         on public.clients(accountant_id);
create index if not exists clients_hr_idx                 on public.clients(hr_id);
create index if not exists m2_contacts_client_idx         on public.m2_contacts(client_id);
create index if not exists m2_deadlines_assignee_idx      on public.m2_deadlines(assignee_id);
create index if not exists m2_deadlines_client_idx        on public.m2_deadlines(client_id);
create index if not exists m2_deadlines_matter_idx        on public.m2_deadlines(matter_id);
create index if not exists m2_matters_assistant_idx       on public.m2_matters(assistant_id);
create index if not exists m2_matters_lead_idx            on public.m2_matters(lead_id);
create index if not exists m2_matters_second_idx          on public.m2_matters(second_id);
create index if not exists m2_orders_client_idx           on public.m2_orders(client_id);
create index if not exists m2_orders_matter_idx           on public.m2_orders(matter_id);
create index if not exists m2_orders_signer_idx           on public.m2_orders(signer_id);
create index if not exists m2_time_member_idx             on public.m2_time(member_id);

-- Klienci widoczni dla osoby z ograniczonym dostępem – liczone raz na zapytanie
create or replace function public.visible_client_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.clients c
   where public.current_member_id() in (c.accountant_id, c.hr_id)
  union
  select a.client_id from public.client_assignments a
   where a.member_id = public.current_member_id()
$$;
revoke execute on function public.visible_client_ids() from public, anon;
grant execute on function public.visible_client_ids() to authenticated;

-- clients
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using ((select public.has_full_access()) or id in (select public.visible_client_ids()));
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated with check ((select public.has_full_access()));
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated using ((select public.is_admin()));

-- checklist_entries
drop policy if exists entries_select on public.checklist_entries;
create policy entries_select on public.checklist_entries for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists entries_insert on public.checklist_entries;
create policy entries_insert on public.checklist_entries for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists entries_update on public.checklist_entries;
create policy entries_update on public.checklist_entries for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists entries_delete on public.checklist_entries;
create policy entries_delete on public.checklist_entries for delete to authenticated using ((select public.is_admin()));

-- period_notes
drop policy if exists notes_select on public.period_notes;
create policy notes_select on public.period_notes for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists notes_insert on public.period_notes;
create policy notes_insert on public.period_notes for insert to authenticated
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
drop policy if exists notes_update on public.period_notes;
create policy notes_update on public.period_notes for update to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))
  with check ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));

-- client_partners: osobne reguły na odczyt i zapis
drop policy if exists partners_select on public.client_partners;
drop policy if exists partners_write on public.client_partners;
create policy partners_select on public.client_partners for select to authenticated
  using ((select public.has_full_access()) or client_id in (select public.visible_client_ids()));
create policy partners_insert on public.client_partners for insert to authenticated with check ((select public.has_full_access()));
create policy partners_update on public.client_partners for update to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
create policy partners_delete on public.client_partners for delete to authenticated using ((select public.has_full_access()));

-- client_assignments
drop policy if exists assign_select on public.client_assignments;
drop policy if exists assign_write on public.client_assignments;
create policy assign_select on public.client_assignments for select to authenticated
  using ((select public.has_full_access()) or member_id = (select public.current_member_id()));
create policy assign_insert on public.client_assignments for insert to authenticated with check ((select public.is_admin()));
create policy assign_delete on public.client_assignments for delete to authenticated using ((select public.is_admin()));

-- task_types
drop policy if exists tasks_select on public.task_types;
drop policy if exists tasks_write on public.task_types;
create policy tasks_select on public.task_types for select to authenticated using ((select public.current_member_id()) is not null);
create policy tasks_insert on public.task_types for insert to authenticated with check ((select public.is_admin()));
create policy tasks_update on public.task_types for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy tasks_delete on public.task_types for delete to authenticated using ((select public.is_admin()));

-- app_settings
drop policy if exists settings_select on public.app_settings;
drop policy if exists settings_write on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated using ((select public.current_member_id()) is not null);
create policy settings_insert on public.app_settings for insert to authenticated with check ((select public.is_admin()));
create policy settings_update on public.app_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- team_members
drop policy if exists team_select on public.team_members;
create policy team_select on public.team_members for select to authenticated using ((select public.current_member_id()) is not null);

-- audit_log
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using ((select public.is_admin()) or (client_id is not null and ((select public.has_full_access()) or client_id in (select public.visible_client_ids()))));

-- moduł M2: uprawnienie sprawdzane raz na zapytanie
do $$
declare t text;
begin
  foreach t in array array['m2_signers','m2_clients','m2_contacts','m2_matters','m2_deadlines','m2_journal','m2_time','m2_orders'] loop
    execute format('drop policy if exists %I on public.%I', t || '_m2', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.has_module(''doradztwo''))) with check ((select public.has_module(''doradztwo'')))', t || '_m2', t);
  end loop;
end $$;
