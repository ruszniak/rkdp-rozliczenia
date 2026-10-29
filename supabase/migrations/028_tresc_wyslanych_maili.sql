-- 028: pełna treść wysłanej wiadomości (kopia w aplikacji)
alter table public.client_messages add column if not exists body text, add column if not exists sender_name text;
