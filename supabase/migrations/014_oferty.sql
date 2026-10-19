-- 014: oferty na usługi (doradztwo podatkowe, księgowość, kadry) – RKDP i M2 TAX, z numeracją OF/RRRR/NNN osobno dla każdej firmy.
create table if not exists public.offers (
  id           uuid primary key default gen_random_uuid(),
  brand        text not null check (brand in ('rkdp','m2')),
  number       text,
  client_id    uuid references public.clients(id) on delete set null,       -- klient RKDP (opcjonalnie)
  m2_client_id uuid references public.m2_clients(id) on delete set null,    -- klient M2 TAX (opcjonalnie)
  client_name  text not null default '',
  offer_date   date not null default current_date,
  status       text not null default 'projekt' check (status in ('projekt','wyslana','zaakceptowana','odrzucona')),
  params       jsonb not null default '{}'::jsonb,
  created_by   uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (brand, number)
);
create index if not exists offers_brand_idx on public.offers (brand, offer_date desc);

create or replace function public.offers_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(coalesce(new.offer_date, current_date), 'YYYY'); n int;
begin
  if new.number is null or new.number = '' then
    perform pg_advisory_xact_lock(hashtext('offers_' || new.brand || y));
    select coalesce(max(nullif(split_part(number, '/', 3), '')::int), 0) + 1 into n
      from offers where brand = new.brand and split_part(number, '/', 2) = y and number ~ '^OF/\d{4}/\d+$';
    new.number := format('OF/%s/%s', y, lpad(n::text, 3, '0'));
  end if;
  return new;
end $$;
revoke execute on function public.offers_number() from public, anon;
drop trigger if exists offers_number on public.offers;
create trigger offers_number before insert on public.offers for each row execute function public.offers_number();
drop trigger if exists offers_touch on public.offers;
create trigger offers_touch before update on public.offers for each row execute function public.touch_row();

alter table public.offers enable row level security;
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select to authenticated using (
  (brand = 'rkdp' and (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or created_by = (select public.current_member_id())
     or (client_id is not null and client_id in (select public.visible_client_ids()))))
  or (brand = 'm2' and (select public.has_module('doradztwo'))));
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers for insert to authenticated with check (created_by = (select public.current_member_id()) and (
  (brand = 'rkdp' and (select public.has_module('rozliczenia'))) or (brand = 'm2' and (select public.has_module('doradztwo')))));
drop policy if exists offers_update on public.offers;
create policy offers_update on public.offers for update to authenticated
  using ((brand = 'rkdp' and ((select public.has_full_access()) or created_by = (select public.current_member_id()))) or (brand = 'm2' and (select public.has_module('doradztwo'))))
  with check ((brand = 'rkdp' and (select public.has_module('rozliczenia'))) or (brand = 'm2' and (select public.has_module('doradztwo'))));
drop policy if exists offers_delete on public.offers;
create policy offers_delete on public.offers for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.offers to authenticated;
