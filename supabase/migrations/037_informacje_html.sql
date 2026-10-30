-- Informacja do klientów: gotowy mail HTML (szablon) zapisany przy wysyłce
alter table public.mail_broadcasts add column if not exists html text;
