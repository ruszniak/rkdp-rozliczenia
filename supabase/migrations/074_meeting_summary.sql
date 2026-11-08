-- automatyczne podsumowania spotkań online (notatki Gemini z Google Meet, dołączone do wydarzenia w Kalendarzu Google)
alter table public.meeting_notes add column if not exists summary text;
alter table public.meeting_notes add column if not exists summary_url text;
alter table public.meeting_notes add column if not exists summary_at timestamptz;
alter table public.meetings add column if not exists summary_tries int not null default 0;
