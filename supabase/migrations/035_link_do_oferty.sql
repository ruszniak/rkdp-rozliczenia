-- 035: link do oferty dla klienta (podgląd bez logowania, tylko do odczytu).
-- Link do oferty pokazuje zawsze aktualną, zapisaną wersję oferty (ref_id → offers.id); wyłączenie / termin jak przy kalkulatorze.
alter table public.shared_docs drop constraint if exists shared_docs_kind_check;
alter table public.shared_docs add constraint shared_docs_kind_check check (kind in ('kalkulator', 'oferta'));
alter table public.shared_docs alter column blocks set default '[]'::jsonb;
alter table public.shared_docs add column if not exists ref_id uuid references public.offers(id) on delete cascade;
create index if not exists shared_docs_ref_idx on public.shared_docs (ref_id);

create or replace function public.shared_docs_guard() returns trigger language plpgsql as $$
begin
  new.token := old.token; new.blocks := old.blocks; new.title := old.title; new.kind := old.kind; new.brand := old.brand;
  new.created_by := old.created_by; new.created_at := old.created_at; new.ref_id := old.ref_id;
  return new;
end $$;

create or replace function public.shared_doc(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.shared_docs; o public.offers;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into r from public.shared_docs where token = p_token;
  if not found or r.revoked_at is not null or (r.expires_at is not null and r.expires_at < now()) then return null; end if;
  if r.kind = 'oferta' then
    select * into o from public.offers where id = r.ref_id;
    if not found then return null; end if;
  end if;
  update public.shared_docs set views = views + 1, last_view_at = now() where id = r.id;
  return jsonb_build_object('title', r.title, 'kind', r.kind, 'brand', r.brand, 'blocks', r.blocks, 'created_at', r.created_at, 'expires_at', r.expires_at)
    || case when r.kind = 'oferta' then jsonb_build_object('offer', o.params, 'number', o.number, 'brand', o.brand, 'updated_at', o.updated_at) else '{}'::jsonb end;
end $$;
revoke all on function public.shared_doc(text) from public;
grant execute on function public.shared_doc(text) to anon, authenticated;

-- link do oferty może utworzyć tylko osoba, która widzi tę ofertę
drop policy if exists sd_insert on public.shared_docs;
create policy sd_insert on public.shared_docs for insert to authenticated
  with check (created_by = (select public.current_member_id())
    and (kind <> 'oferta' or exists (select 1 from public.offers o where o.id = ref_id)));
