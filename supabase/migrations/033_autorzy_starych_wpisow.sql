-- 033: autorzy wpisów przeniesionych z dawnego pola „Uwagi” – ustaleni z historii zmian (audit_log);
-- wpisy z importu arkusza Excel oznaczone jako imported (autor nieznany).
alter table public.period_comments add column if not exists imported boolean not null default false;
alter table public.period_comments disable trigger period_comments_guard;
with m as (
 select c.id, (select a.actor from audit_log a where a.table_name='period_notes' and a.client_id=c.client_id and a.period=c.period
   and a.detail::text ilike '%'||replace(c.body,'"','')||'%' order by a.at asc limit 1) actor
 from period_comments c where c.author is null)
update period_comments pc set
  author = (select tm.id from team_members tm where lower(tm.email) = m.actor),
  imported = coalesce(m.actor = 'system', false)
from m where pc.id = m.id;
alter table public.period_comments enable trigger period_comments_guard;
