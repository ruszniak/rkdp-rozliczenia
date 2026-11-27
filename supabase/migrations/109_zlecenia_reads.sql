-- Zadania: kiedy osoba ostatnio otworzyła zadanie – na liście widać „nowy komentarz”, gdy ktoś inny dopisał coś później.
create table if not exists public.zlecenia_reads (
  zlecenie_id uuid not null references public.zlecenia(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (zlecenie_id, member_id)
);
alter table public.zlecenia_reads enable row level security;
create policy zlecenia_reads_own on public.zlecenia_reads for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
-- stan początkowy: wszystko dotychczasowe uznane za przeczytane (bez fali „nowych” po wdrożeniu)
insert into public.zlecenia_reads (zlecenie_id, member_id, read_at)
select z.id, m.mid, now() from public.zlecenia z
cross join lateral (select unnest(array[z.assignee_id, z.created_by] || coalesce(z.helpers, '{}'::uuid[])) as mid) m
where m.mid is not null and exists (select 1 from public.team_members t where t.id = m.mid)
on conflict do nothing;
