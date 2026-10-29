-- 034: „Nieprzeczytane” liczone dla każdej osoby osobno i dla wszystkich klientów, których widzi (nie tylko „moich”):
-- wpis innej osoby po moim ostatnim odczycie rozmowy = nieprzeczytane, dopóki sam(a) nie otworzę rozmowy.
create or replace function public.unread_threads()
returns table (client_id uuid, name text, n int, last_at timestamptz, mentioned boolean, period date)
language sql stable security invoker set search_path = public as $$
  with me as (select public.current_member_id() id),
  ev as (
    select c.client_id, c.created_at at, c.period, (select id from me) = any(c.mentions) m
      from period_comments c where c.deleted_at is null and c.author is distinct from (select id from me)
        and c.author is not null and c.created_at > now() - interval '90 days'
    union all
    select t.client_id, t.created_at, coalesce(t.period, date_trunc('month', t.created_at)::date), t.assignee_id = (select id from me)
      from rkdp_tickets t where t.client_id is not null and t.module = 'rkdp' and t.created_by is distinct from (select id from me)
        and t.created_at > now() - interval '90 days'
    union all
    select t.client_id, k.created_at, coalesce(t.period, date_trunc('month', t.created_at)::date), false
      from rkdp_ticket_comments k join rkdp_tickets t on t.id = k.ticket_id
     where t.client_id is not null and k.kind <> 'zmiana' and k.author_id is distinct from (select id from me)
       and k.created_at > now() - interval '90 days'
  )
  select e.client_id, cl.name, count(*)::int, max(e.at), bool_or(e.m), (array_agg(e.period order by e.at desc))[1]
    from ev e join clients cl on cl.id = e.client_id
    left join thread_reads r on r.client_id = e.client_id and r.member_id = (select id from me)
   where e.at > coalesce(r.read_at, now() - interval '14 days')
   group by e.client_id, cl.name
   order by max(e.at) desc
   limit 500
$$;
grant execute on function public.unread_threads() to authenticated;
