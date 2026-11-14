-- Program Partner M2 TAX: konta pracowników biur rachunkowych (moduł „partner”, zwykle razem z „jpk”).
-- Partner widzi tylko: zadania swojego biura (pytania do doradców), wzory dla klientów i podgląd JPK.
-- Zadanie od partnera trafia automatycznie do doradcy biura (m2_clients.partner_advisor_id albo domyślnie administratora
-- z modułem doradztwa) i drugiego doradcy; jest powiązane z kartą biura (zlecenia.m2_client_id) – czas pracy liczy się na biuro.
alter table public.team_members add column if not exists partner_client_id uuid references public.m2_clients(id) on delete set null;
alter table public.zlecenia add column if not exists m2_client_id uuid references public.m2_clients(id) on delete set null;
alter table public.m2_clients add column if not exists partner_advisor_id uuid references public.team_members(id) on delete set null;
create index if not exists zlecenia_m2c_idx on public.zlecenia(m2_client_id) where m2_client_id is not null;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_module('rozliczenia') or public.has_module('doradztwo')
$$;
create or replace function public.my_partner_client() returns uuid language sql stable security definer set search_path to 'public' as $$
  select m.partner_client_id from public.team_members m where m.id = public.current_member_id() and 'partner' = any(m.modules)
$$;

-- nowe zadanie od partnera: biuro, doradca prowadzący i drugi doradca ustawiane przez bazę
create or replace function public.zl_partner_defaults() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare pc uuid := public.my_partner_client(); adv uuid;
begin
  if tg_op = 'INSERT' then
    if public.has_module('partner') and not public.is_staff() then
      if pc is null then raise exception 'Konto partnera nie jest przypisane do biura – skontaktuj się z M2 TAX'; end if;
      new.m2_client_id := pc; new.created_by := public.current_member_id(); new.client_id := null; new.matter_id := null;
      select partner_advisor_id into adv from public.m2_clients where id = pc;
      if adv is null or not exists (select 1 from public.team_members where id = adv and active) then
        select id into adv from public.team_members where active and role = 'admin' and 'doradztwo' = any(modules) order by created_at limit 1;
      end if;
      new.assignee_id := adv;
      new.helpers := array(select id from public.team_members where active and role in ('admin', 'full') and 'doradztwo' = any(modules) and id <> adv order by created_at limit 2);
    end if;
  elsif public.has_module('partner') and not public.is_staff() then
    -- partner może poprawić treść swojego zadania, ale nie biuro ani osoby
    new.m2_client_id := old.m2_client_id; new.assignee_id := old.assignee_id; new.helpers := old.helpers;
    new.client_id := old.client_id; new.matter_id := old.matter_id; new.created_by := old.created_by;
  end if;
  return new;
end $$;
create or replace trigger zlecenia_partner before insert or update on public.zlecenia for each row execute function public.zl_partner_defaults();

-- widoczność zadań: dotychczasowe zasady + zadania biura (dla jego pracowników) + wszystkie zadania biur dla doradców M2 TAX
create or replace function public.zl_visible(p_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.zlecenia z where z.id = p_id and (public.is_admin() or z.assignee_id = public.current_member_id()
    or z.created_by = public.current_member_id() or public.current_member_id() = any(z.helpers)
    or (z.m2_client_id is not null and (z.m2_client_id = public.my_partner_client() or public.has_module('doradztwo')))));
$$;
alter policy zl_select on public.zlecenia using ((select is_admin()) or assignee_id = (select current_member_id()) or created_by = (select current_member_id())
  or (select current_member_id()) = any(helpers) or (m2_client_id is not null and (m2_client_id = (select my_partner_client()) or (select has_module('doradztwo')))));
alter policy zw_select on public.zlecenia_wpisy using ((select zl_visible(zlecenie_id)));
alter policy zw_insert on public.zlecenia_wpisy with check (kind = 'komentarz' and author_id = (select current_member_id()) and (select zl_visible(zlecenie_id)));

-- dane zespołu: partnerzy (i konta tylko JPK) widzą osoby z zespołu kancelarii, siebie i współpracowników z własnego biura
alter policy team_select on public.team_members using ((select current_member_id()) is not null and ((select is_staff())
  or id = (select current_member_id()) or 'rozliczenia' = any(modules) or 'doradztwo' = any(modules)
  or (partner_client_id is not null and partner_client_id = (select my_partner_client()))));
alter policy member_profiles_select on public.member_profiles using ((select is_staff()) or member_id = (select current_member_id()));
alter policy settings_select on public.app_settings using ((select current_member_id()) is not null and ((select is_staff()) or key in ('session_idle_minutes', 'device_trust_days', 'app_url', 'terms_rollout_at')));
alter policy bd_read on public.booking_days using ((select is_staff()));
alter policy bh_read on public.booking_hours using ((select is_staff()));
alter policy bm_read on public.booking_members using ((select is_staff()));
alter policy bs_read on public.booking_settings using ((select is_staff()));
alter policy mm_read on public.meeting_members using ((select is_staff()));
alter policy mt_read on public.meeting_types using ((select is_staff()));

-- informacje dla partnera o własnym biurze: nazwa, pakiet, czas pracy doradców w bieżącym miesiącu (bez danych wewnętrznych karty)
create or replace function public.partner_info() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name, 'package', c.partner_package,
    'minutes_month', coalesce((select sum(t.minutes) from public.time_entries t where t.m2_client_id = c.id and t.started_at >= date_trunc('month', now())), 0)) end
  from (select public.my_partner_client() as pc) x left join public.m2_clients c on c.id = x.pc
$$;
grant execute on function public.partner_info() to authenticated;
