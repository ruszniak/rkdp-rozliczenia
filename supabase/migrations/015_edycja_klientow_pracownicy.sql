-- 015: pracownicy z ograniczonym dostępem mogą edytować dane SWOICH klientów (tych, których widzą),
-- ale nie zmieniają przypisań (księgowa, kadrowa) – to nadal tylko osoby z pełnym dostępem.
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using ((select public.has_full_access()) or ((select public.has_module('rozliczenia')) and id in (select public.visible_client_ids())))
  with check ((select public.has_full_access()) or ((select public.has_module('rozliczenia')) and id in (select public.visible_client_ids())));

create or replace function public.clients_guard_assignments() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.has_full_access() and (new.accountant_id is distinct from old.accountant_id or new.hr_id is distinct from old.hr_id) then
    raise exception 'Przypisanie księgowej i kadrowej może zmienić tylko osoba z pełnym dostępem.';
  end if;
  return new;
end $$;
drop trigger if exists clients_guard_assignments on public.clients;
create trigger clients_guard_assignments before update on public.clients for each row execute function public.clients_guard_assignments();

-- wspólnicy klienta: edycja dla osób, które widzą klienta
drop policy if exists partners_insert on public.client_partners;
create policy partners_insert on public.client_partners for insert to authenticated
  with check ((select public.has_full_access()) or ((select public.has_module('rozliczenia')) and client_id in (select public.visible_client_ids())));
drop policy if exists partners_update on public.client_partners;
create policy partners_update on public.client_partners for update to authenticated
  using ((select public.has_full_access()) or ((select public.has_module('rozliczenia')) and client_id in (select public.visible_client_ids())))
  with check ((select public.has_full_access()) or ((select public.has_module('rozliczenia')) and client_id in (select public.visible_client_ids())));
drop policy if exists partners_delete on public.client_partners;
create policy partners_delete on public.client_partners for delete to authenticated
  using ((select public.has_full_access()) or ((select public.has_module('rozliczenia')) and client_id in (select public.visible_client_ids())));
