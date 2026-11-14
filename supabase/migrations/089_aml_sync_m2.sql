-- AML klientów M2 TAX: data weryfikacji i ryzyko na karcie/liście klientów zawsze zgodne z weryfikacją AML (aml_cases).
-- Wcześniej zapis formularza karty klienta mógł nadpisać datę AML starą (pustą) wartością.
create or replace function public.aml_case_sync_m2() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.m2_client_id is not null and new.verified_at is not null then
    update public.m2_clients set aml_verified_at = (new.verified_at at time zone 'Europe/Warsaw')::date, aml_risk = coalesce(new.risk_level, aml_risk)
     where id = new.m2_client_id and (aml_verified_at is distinct from (new.verified_at at time zone 'Europe/Warsaw')::date or aml_risk is distinct from coalesce(new.risk_level, aml_risk));
  end if;
  return null;
end $$;
create or replace trigger aml_cases_sync_m2 after insert or update of verified_at, risk_level on public.aml_cases for each row execute function public.aml_case_sync_m2();

create or replace function public.m2_clients_keep_aml() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare k record;
begin
  select verified_at, risk_level into k from public.aml_cases where m2_client_id = new.id and verified_at is not null order by verified_at desc limit 1;
  if found and (new.aml_verified_at is null or new.aml_verified_at < (k.verified_at at time zone 'Europe/Warsaw')::date) then
    new.aml_verified_at := (k.verified_at at time zone 'Europe/Warsaw')::date;
    new.aml_risk := coalesce(k.risk_level, new.aml_risk);
  end if;
  return new;
end $$;
create or replace trigger m2_clients_keep_aml before update on public.m2_clients for each row execute function public.m2_clients_keep_aml();

update public.m2_clients c set aml_verified_at = (a.verified_at at time zone 'Europe/Warsaw')::date, aml_risk = coalesce(a.risk_level, c.aml_risk)
  from public.aml_cases a where a.m2_client_id = c.id and a.verified_at is not null and (c.aml_verified_at is null or c.aml_verified_at < (a.verified_at at time zone 'Europe/Warsaw')::date);
