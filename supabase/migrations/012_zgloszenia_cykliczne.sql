-- 012: RKDP – zadania cykliczne. Szablon tworzy zgłoszenie automatycznie (co tydzień / miesiąc / kwartał / rok),
-- „lead_days” dni przed terminem. Generowanie: funkcja rkdp_generate_recurring() wywoływana przy wejściu do aplikacji
-- (pulpit, zgłoszenia) – nie wymaga harmonogramu w bazie; jest bezpieczna przy równoczesnych wywołaniach.
create table if not exists public.rkdp_ticket_templates (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  description   text,
  client_id     uuid references public.clients(id) on delete cascade,
  category      text not null default 'inne',
  priority      text not null default 'normalny' check (priority in ('niski','normalny','wysoki','pilny')),
  assignee_id   uuid references public.team_members(id) on delete set null,
  frequency     text not null default 'miesiac' check (frequency in ('tydzien','miesiac','kwartal','rok')),
  due_day       int  not null default 10 check (due_day between 1 and 31),   -- dzień miesiąca (tydzień: 1 = pon … 7 = niedz.)
  due_month     int  not null default 1  check (due_month between 1 and 12), -- rok: miesiąc; kwartał: 1–3 = miesiąc kwartału
  lead_days     int  not null default 7  check (lead_days between 0 and 60),
  active        boolean not null default true,
  next_due      date,
  last_created  date,
  created_by    uuid references public.team_members(id) on delete set null default public.current_member_id(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rkdp_ticket_templates_next_idx on public.rkdp_ticket_templates (active, next_due);

alter table public.rkdp_tickets add column if not exists template_id uuid references public.rkdp_ticket_templates(id) on delete set null;

-- najbliższy termin PO dniu „after”
create or replace function public.rkdp_next_due(freq text, d int, mth int, after date) returns date
language plpgsql immutable set search_path = public as $$
declare
  y int; m int; c date; i int;
begin
  if freq = 'tydzien' then
    return after + (((least(greatest(d,1),7) - extract(isodow from after)::int + 6) % 7) + 1);
  end if;
  for i in 0..30 loop
    y := extract(year from after)::int; m := extract(month from after)::int + i;
    y := y + (m - 1) / 12; m := ((m - 1) % 12) + 1;
    if freq = 'kwartal' and ((m - 1) % 3) + 1 <> least(greatest(mth,1),3) then continue; end if;
    if freq = 'rok' and m <> mth then continue; end if;
    c := make_date(y, m, 1);
    c := c + (least(d, extract(day from (c + interval '1 month - 1 day'))::int) - 1);
    if c > after then return c; end if;
  end loop;
  return null;
end $$;

create or replace function public.rkdp_template_schedule() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or new.frequency is distinct from old.frequency or new.due_day is distinct from old.due_day
     or new.due_month is distinct from old.due_month or new.next_due is null or (new.active and not old.active) then
    new.next_due := public.rkdp_next_due(new.frequency, new.due_day, new.due_month, greatest(current_date - 1, coalesce(new.last_created, current_date - 1)));
  end if;
  return new;
end $$;
drop trigger if exists rkdp_ticket_templates_schedule on public.rkdp_ticket_templates;
create trigger rkdp_ticket_templates_schedule before insert or update on public.rkdp_ticket_templates
  for each row execute function public.rkdp_template_schedule();

-- tworzy należne zgłoszenia (maks. 3 zaległe okresy na szablon), zwraca liczbę utworzonych
create or replace function public.rkdp_generate_recurring() returns int
language plpgsql security definer set search_path = public as $$
declare
  t record; n int := 0; k int;
begin
  if public.current_member_id() is null or not public.has_module('rozliczenia') then return 0; end if;
  for t in select * from rkdp_ticket_templates
            where active and next_due is not null and next_due - lead_days <= current_date
            for update skip locked loop
    k := 0;
    while t.next_due is not null and t.next_due - t.lead_days <= current_date and k < 3 loop
      if not exists (select 1 from rkdp_tickets where template_id = t.id and due_date = t.next_due) then
        insert into rkdp_tickets(title, description, client_id, category, priority, assignee_id, due_date, source, created_by, template_id)
        values (t.title, t.description, t.client_id, t.category, t.priority, t.assignee_id, t.next_due, 'cykliczne', coalesce(t.created_by, t.assignee_id), t.id);
        n := n + 1;
      end if;
      t.last_created := t.next_due;
      t.next_due := public.rkdp_next_due(t.frequency, t.due_day, t.due_month, t.next_due);
      k := k + 1;
    end loop;
    -- przeskocz okresy starsze niż 3 ostatnie (aplikacja długo nieużywana)
    while t.next_due is not null and t.next_due < current_date loop
      t.next_due := public.rkdp_next_due(t.frequency, t.due_day, t.due_month, t.next_due);
    end loop;
    update rkdp_ticket_templates set next_due = t.next_due, last_created = t.last_created where id = t.id;
  end loop;
  return n;
end $$;
revoke execute on function public.rkdp_generate_recurring() from public, anon;
grant execute on function public.rkdp_generate_recurring() to authenticated;

alter table public.rkdp_ticket_templates enable row level security;
drop policy if exists rkdp_tt_select on public.rkdp_ticket_templates;
create policy rkdp_tt_select on public.rkdp_ticket_templates for select to authenticated using (
  (select public.has_module('rozliczenia')) and ((select public.has_full_access()) or created_by = (select public.current_member_id())
    or assignee_id = (select public.current_member_id()) or (client_id is not null and client_id in (select public.visible_client_ids()))));
drop policy if exists rkdp_tt_insert on public.rkdp_ticket_templates;
create policy rkdp_tt_insert on public.rkdp_ticket_templates for insert to authenticated
  with check ((select public.has_module('rozliczenia')) and created_by = (select public.current_member_id()));
drop policy if exists rkdp_tt_update on public.rkdp_ticket_templates;
create policy rkdp_tt_update on public.rkdp_ticket_templates for update to authenticated
  using ((select public.has_full_access()) or created_by = (select public.current_member_id()))
  with check ((select public.has_full_access()) or created_by = (select public.current_member_id()));
drop policy if exists rkdp_tt_delete on public.rkdp_ticket_templates;
create policy rkdp_tt_delete on public.rkdp_ticket_templates for delete to authenticated
  using ((select public.is_admin()) or created_by = (select public.current_member_id()));
grant select, insert, update, delete on public.rkdp_ticket_templates to authenticated;
