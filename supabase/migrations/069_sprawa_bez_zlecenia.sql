-- Sprawa = zlecenie: sprawę zakłada się bez osobnego zlecenia; dokument zlecenia/umowy jest opcjonalny
alter table public.m2_matters alter column order_id drop not null;
CREATE OR REPLACE FUNCTION public.m2_matter_client()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.order_id is not null then
    select client_id, firm into new.client_id, new.firm from public.m2_orders where id = new.order_id;
  else
    select coalesce(new.firm, c.firm) into new.firm from public.m2_clients c where c.id = new.client_id;
  end if;
  return new;
end $function$;
