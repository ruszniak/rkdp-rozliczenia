-- 032: uwagę można oznaczyć jako „zrobione” (resolved_at). Zrobione uwagi zostają w historii rozmowy (przekreślone),
-- ale znikają z podsumowania w tabeli rozliczeń (ikonka „Rozmowa”, eksport) – tak jak wyjaśnione pytania.
create or replace function public.period_comments_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.client_id, old.client_id); per date := coalesce(new.period, old.period); n text; q text;
begin
  select string_agg(body, E'\n' order by created_at) filter (where kind = 'uwaga' and resolved_at is null),
         string_agg(body, E'\n' order by created_at) filter (where kind = 'pytanie' and resolved_at is null)
    into n, q from public.period_comments where client_id = cid and period = per and deleted_at is null and parent_id is null;
  insert into public.period_notes (client_id, period, notes, questions) values (cid, per, n, q)
    on conflict (client_id, period) do update set notes = excluded.notes, questions = excluded.questions
    where period_notes.notes is distinct from excluded.notes or period_notes.questions is distinct from excluded.questions;
  return null;
end $$;
