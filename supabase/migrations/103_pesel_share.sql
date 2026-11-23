-- Wspólne dane do pełnomocnictw: osoby z pesel_share widzą nawzajem PESEL i dowód (tylko odczyt)
alter table public.team_members add column if not exists pesel_share boolean not null default false;
comment on column public.team_members.pesel_share is 'Osoby z tą opcją widzą nawzajem PESEL i dowód (member_private) – do pełnomocnictw generowanych za kogoś z zespołu';
create or replace function public.pesel_shared() returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select pesel_share and active from public.team_members where id = public.current_member_id()), false)
$$;
drop policy if exists member_private_share on public.member_private;
create policy member_private_share on public.member_private for select to authenticated
  using ((select public.pesel_shared()) and member_id in (select id from public.team_members where pesel_share and active));
update public.team_members set pesel_share = true where id in ('d862198b-9f25-4eda-9225-731dac263656','cec2fc98-671b-445e-9b93-9dbf1a3c08e3','af2e5dba-8782-4a51-b8cf-5c048a008673','5c8f1a7f-cb1e-41ff-a2a4-15e5032a4dd4');
