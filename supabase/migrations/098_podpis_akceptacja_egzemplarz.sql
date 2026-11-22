-- Akceptacja stanowiska biura przez klienta i egzemplarz podpisany przez obie strony
alter table public.sign_notes add column if not exists kind text not null default 'uwaga'
  check (kind in ('uwaga','akceptacja','odpowiedz','wersja','do_podpisu'));
alter table public.sign_requests add column if not exists accepted_at timestamptz;
alter table public.sign_requests add column if not exists final_path text;
alter table public.sign_requests add column if not exists final_name text;
alter table public.sign_requests add column if not exists final_file_id uuid references public.client_files(id) on delete set null;
alter table public.sign_requests add column if not exists final_at timestamptz;
update public.sign_notes set kind = 'odpowiedz' where from_client = false and kind = 'uwaga';
