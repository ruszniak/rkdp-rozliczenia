-- 018: historia zmian M2 TAX – kto, kiedy i co zmienił w kliencie, sprawie i ich elementach
-- (osoby kontaktowe, terminy, dziennik, godziny, zlecenia). Zapisuje wyzwalacz, przeglądają osoby z modułem Doradztwo.
create table if not exists public.m2_history (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references public.team_members(id) on delete set null,
  actor      text,
  table_name text not null,
  row_id     uuid,
  client_id  uuid,
  matter_id  uuid,
  action     text not null check (action in ('insert','update','delete')),
  label      text,
  changes    jsonb
);
create index if not exists m2_history_client_idx on public.m2_history (client_id, at desc);
create index if not exists m2_history_matter_idx on public.m2_history (matter_id, at desc);

create or replace function public.m2_write_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  diff jsonb := '{}'::jsonb;
  k text;
  v_matter uuid; v_client uuid;
  skip text[] := array['id','created_at','updated_at','created_by','done_at'];
  cut constant int := 300;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k = any(skip) then continue; end if;
      if (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, case when k = 'params'
          then jsonb_build_array(null, null)
          else jsonb_build_array(left(o ->> k, cut), left(n ->> k, cut)) end);
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  elsif tg_op = 'INSERT' then
    diff := null;
  end if;

  if tg_table_name = 'm2_matters' then v_matter := (r ->> 'id')::uuid; v_client := (r ->> 'client_id')::uuid;
  elsif tg_table_name = 'm2_clients' then v_client := (r ->> 'id')::uuid;
  else
    v_matter := nullif(r ->> 'matter_id', '')::uuid;
    v_client := nullif(r ->> 'client_id', '')::uuid;
    if v_client is null and v_matter is not null then select client_id into v_client from m2_matters where id = v_matter; end if;
  end if;

  insert into m2_history (actor_id, actor, table_name, row_id, client_id, matter_id, action, label, changes)
  values (public.current_member_id(), coalesce((select full_name from team_members where id = public.current_member_id()), public.current_email()),
    tg_table_name, (r ->> 'id')::uuid, v_client, v_matter, lower(tg_op),
    left(coalesce(r ->> 'number' || ' · ' || coalesce(r ->> 'title', r ->> 'subject', ''), r ->> 'title', r ->> 'name', r ->> 'full_name', r ->> 'subject', r ->> 'description'), 200),
    diff);
  return null;
end $$;
revoke execute on function public.m2_write_history() from public, anon;

do $$ declare t text; begin
  foreach t in array array['m2_clients','m2_matters','m2_contacts','m2_deadlines','m2_journal','m2_time','m2_orders'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_history', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.m2_write_history()', t || '_history', t);
  end loop;
end $$;

alter table public.m2_history enable row level security;
drop policy if exists m2_history_select on public.m2_history;
create policy m2_history_select on public.m2_history for select to authenticated using ((select public.has_module('doradztwo')));
grant select on public.m2_history to authenticated;
