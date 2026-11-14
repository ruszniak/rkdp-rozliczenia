-- „Co nowego” dla wybranych osób z zespołu: okno po zalogowaniu (do potwierdzenia „Rozumiem”) + push i e-mail jak przy nowym zadaniu
create table if not exists public.ogloszenia (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  items jsonb not null default '[]'::jsonb,   -- lista punktów (tekst)
  url text,                                   -- opcjonalny link „Więcej”
  audience uuid[] not null default '{}',      -- komu pokazać (team_members.id)
  created_by uuid default public.current_member_id(),
  created_at timestamptz not null default now()
);
create table if not exists public.ogloszenia_odczyty (
  ogloszenie_id uuid not null references public.ogloszenia(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (ogloszenie_id, member_id)
);
alter table public.ogloszenia enable row level security;
alter table public.ogloszenia_odczyty enable row level security;

create policy og_select on public.ogloszenia for select to authenticated
  using ((select public.current_member_id()) = any(audience) or (select public.is_admin()));
create policy og_insert on public.ogloszenia for insert to authenticated with check ((select public.is_admin()));
create policy og_update on public.ogloszenia for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy ogo_select on public.ogloszenia_odczyty for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
create policy ogo_insert on public.ogloszenia_odczyty for insert to authenticated
  with check (member_id = (select public.current_member_id())
    and exists (select 1 from public.ogloszenia o where o.id = ogloszenie_id and member_id = any(o.audience)));

grant select, insert, update on public.ogloszenia to authenticated;
grant select, insert on public.ogloszenia_odczyty to authenticated;

-- powiadomienia po dodaniu ogłoszenia: push + e-mail (funkcje push i mail, sekret z Vault)
create or replace function public.ogloszenie_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.push_call(jsonb_build_object('event', 'ogloszenie', 'id', new.id));
    perform public.edge_call('ogloszenia', jsonb_build_object('id', new.id));
  exception when others then null;
  end;
  return new;
end $$;
create trigger ogloszenia_notify after insert on public.ogloszenia for each row execute function public.ogloszenie_notify();
