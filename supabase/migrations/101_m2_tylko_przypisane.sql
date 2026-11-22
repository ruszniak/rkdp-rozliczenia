-- M2 TAX: osoba z zakresem „tylko przypisane sprawy” (team_members.m2_scope = 'own') widzi tylko sprawy, w których jest
-- doradcą prowadzącym, drugim doradcą albo asystentem(-ką), klientów tych spraw i ich zlecenia/umowy; bez ofert i zadań biur M2 TAX
-- (poza zadaniami, w których sama bierze udział).
alter table public.team_members add column if not exists m2_scope text not null default 'all' check (m2_scope in ('all', 'own'));
comment on column public.team_members.m2_scope is 'M2 TAX: all – wszystkie sprawy i klienci; own – tylko sprawy, do których osoba jest przypisana (lead/second/assistant)';

create or replace function public.m2_all() returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select m2_scope = 'all' from public.team_members where id = public.current_member_id()), true)
$$;
create or replace function public.m2_my_client_ids() returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select m.client_id from public.m2_matters m where public.current_member_id() in (m.lead_id, m.second_id, m.assistant_id)
$$;
create or replace function public.m2_my_order_ids() returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select m.order_id from public.m2_matters m where m.order_id is not null and public.current_member_id() in (m.lead_id, m.second_id, m.assistant_id)
$$;

create or replace function public.m2_client_ok(cid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.m2_clients c where c.id = cid and public.can_m2_client(c.firm, c.rkdp_client_id)
    and (c.firm <> 'm2' or public.m2_all() or c.id in (select public.m2_my_client_ids())))
$$;
create or replace function public.m2_matter_ok(mid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.m2_matters m where m.id = mid and public.m2_client_ok(m.client_id)
    and (m.firm <> 'm2' or public.m2_all() or public.current_member_id() in (m.lead_id, m.second_id, m.assistant_id)))
$$;

drop policy if exists m2_clients_m2 on public.m2_clients;
create policy m2_clients_m2 on public.m2_clients for all
  using ((select public.can_m2_client(firm, rkdp_client_id)) and (firm <> 'm2' or (select public.m2_all()) or id in (select public.m2_my_client_ids())))
  with check ((select public.can_m2_client(firm, rkdp_client_id)));

drop policy if exists m2_matters_select on public.m2_matters;
create policy m2_matters_select on public.m2_matters for select
  using (public.m2_client_ok(client_id) and (firm <> 'm2' or (select public.m2_all()) or (select public.current_member_id()) in (lead_id, second_id, assistant_id)));
drop policy if exists m2_matters_update on public.m2_matters;
create policy m2_matters_update on public.m2_matters for update
  using (public.m2_client_ok(client_id) and (firm <> 'm2' or (select public.m2_all()) or (select public.current_member_id()) in (lead_id, second_id, assistant_id)));

drop policy if exists m2_orders_select on public.m2_orders;
create policy m2_orders_select on public.m2_orders for select
  using (public.m2_client_ok(client_id) and ((select public.m2_all()) or id in (select public.m2_my_order_ids())));
drop policy if exists m2_orders_update on public.m2_orders;
create policy m2_orders_update on public.m2_orders for update
  using (public.m2_client_ok(client_id) and ((select public.m2_all()) or id in (select public.m2_my_order_ids())));

drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select using (
  ((brand = 'rkdp') and (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or created_by = (select public.current_member_id()) or (client_id is not null and client_id in (select public.visible_client_ids()))))
  or ((brand = 'm2') and (select public.has_module('doradztwo')) and ((select public.m2_all()) or created_by = (select public.current_member_id()))));

drop policy if exists zl_select on public.zlecenia;
create policy zl_select on public.zlecenia for select using (
  (select public.is_admin()) or assignee_id = (select public.current_member_id()) or created_by = (select public.current_member_id())
  or (select public.current_member_id()) = any (helpers)
  or (m2_client_id is not null and (m2_client_id = (select public.my_partner_client()) or ((select public.has_module('doradztwo')) and (select public.m2_all())))));

update public.team_members set m2_scope = 'own' where id = 'd8af506f-2b33-410f-92c4-d699e95a5c51';
