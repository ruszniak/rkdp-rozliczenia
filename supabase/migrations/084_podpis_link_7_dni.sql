-- Link do podpisu dokumentu ważny 7 dni (wcześniej 60).
alter table public.sign_requests alter column expires_at set default now() + interval '7 days';
