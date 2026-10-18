-- 007: M2 TAX – zlecenie albo umowa; każda sprawa należy do zlecenia/umowy; usuwanie tylko przez administratora

-- 1. Rodzaj dokumentu i parametry umowy
alter table public.m2_orders add column if not exists doc_type text not null default 'zlecenie';
alter table public.m2_orders drop constraint if exists m2_orders_doc_type_check;
alter table public.m2_orders add constraint m2_orders_doc_type_check check (doc_type in ('zlecenie','umowa'));
alter table public.m2_orders add column if not exists params jsonb not null default '{}'::jsonb;   -- dane umowy (organ, wariant wynagrodzenia…)
alter table public.m2_orders add column if not exists signer_ids uuid[];                         -- umowę podpisuje kilku partnerów

-- odmiana do komparycji („reprezentowaną przez: Michała Ruszniaka – partnera zarządzającego”)
alter table public.m2_signers add column if not exists name_acc text;
alter table public.m2_signers add column if not exists role_acc text;
update public.m2_signers set name_acc = 'Michała Ruszniaka' where full_name = 'Michał Ruszniak' and name_acc is null;
update public.m2_signers set name_acc = 'Marcina Otrębę' where full_name = 'Marcin Otręba' and name_acc is null;
update public.m2_signers set role_acc = 'partnera zarządzającego' where role_label ilike 'partner zarządzający' and role_acc is null;

-- 2. Sprawa należy do zlecenia/umowy (jedno zlecenie – wiele spraw)
alter table public.m2_matters add column if not exists order_id uuid references public.m2_orders(id) on delete cascade;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'm2_orders' and column_name = 'matter_id') then
    execute 'update public.m2_matters m set order_id = o.id from public.m2_orders o where o.matter_id = m.id and m.order_id is null';
  end if;
end $$;

-- sprawy, które nie mają zlecenia, dostają zlecenie-projekt (żeby nic nie zginęło)
insert into public.m2_orders (client_id, subject, order_date, status, doc_type, fee_type, fee_amount, params)
select m.client_id, m.title, m.opened_at, 'projekt', 'zlecenie', m.fee_type, m.fee_amount, jsonb_build_object('_matter', m.id)
  from public.m2_matters m where m.order_id is null;
update public.m2_matters m set order_id = o.id
  from public.m2_orders o where o.params ->> '_matter' = m.id::text and m.order_id is null;
update public.m2_orders set params = params - '_matter' where params ? '_matter';

alter table public.m2_matters alter column order_id set not null;
create index if not exists m2_matters_order_idx on public.m2_matters(order_id);
alter table public.m2_orders drop column if exists matter_id;

-- klient sprawy = klient zlecenia (pilnuje baza)
create or replace function public.m2_matter_client() returns trigger
language plpgsql set search_path = public as $$
begin
  select client_id into new.client_id from public.m2_orders where id = new.order_id;
  return new;
end $$;
drop trigger if exists m2_matter_client on public.m2_matters;
create trigger m2_matter_client before insert or update of order_id, client_id on public.m2_matters
  for each row execute function public.m2_matter_client();

create or replace function public.m2_order_client_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.client_id is distinct from old.client_id then
    update public.m2_matters set client_id = new.client_id where order_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists m2_order_client_sync on public.m2_orders;
create trigger m2_order_client_sync after update of client_id on public.m2_orders
  for each row execute function public.m2_order_client_sync();

-- 3. Numeracja: zlecenia Z/RRRR/NNN, umowy U/RRRR/NNN
create or replace function public.m2_order_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(coalesce(new.order_date, current_date), 'YYYY'); n int;
        pfx text := case when new.doc_type = 'umowa' then 'U' else 'Z' end;
begin
  if new.number is null then
    select coalesce(max(split_part(number, '/', 3)::int), 0) + 1 into n
      from public.m2_orders where number like pfx || '/' || y || '/%';
    new.number := pfx || '/' || y || '/' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;

revoke execute on function public.m2_matter_client(), public.m2_order_client_sync() from public, anon, authenticated;

-- 4. Usuwanie zleceń, umów i spraw – tylko administrator (z modułem Doradztwo)
do $$
declare t text;
begin
  foreach t in array array['m2_orders','m2_matters'] loop
    execute format('drop policy if exists %I on public.%I', t || '_m2', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_module(''doradztwo'')))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_module(''doradztwo'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.has_module(''doradztwo''))) with check ((select public.has_module(''doradztwo'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_module(''doradztwo'')) and (select public.is_admin()))', t || '_delete', t);
  end loop;
end $$;
