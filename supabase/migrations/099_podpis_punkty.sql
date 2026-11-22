alter table public.sign_notes add column if not exists points jsonb;
comment on column public.sign_notes.points is 'Uwaga podzielona na punkty: [{n: etykieta, t: treść, v: ocena kancelarii, c: komentarz kancelarii, a: ok|uwaga (odpowiedź klienta), x: tekst klienta, pv/pc: poprzednia ocena/komentarz}]';
