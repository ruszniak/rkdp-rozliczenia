-- 095: koszt pracowników księgowości (tylko administrator): wynagrodzenie jako procent abonamentów klientów albo stała kwota.
create table if not exists public.staff_pay (
  member_id  uuid primary key references public.team_members(id) on delete cascade,
  mode       text not null default 'procent' check (mode in ('procent','kwota')),
  value      numeric(12,2) not null default 0 check (value >= 0),
  basis      text not null default 'ksiegowa' check (basis in ('ksiegowa','kadrowa','obie')),
  note       text check (length(note) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.staff_pay enable row level security;
create policy staff_pay_admin on public.staff_pay for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update on public.staff_pay to authenticated;
create or replace trigger staff_pay_touch before update on public.staff_pay for each row execute function public.touch_row();
