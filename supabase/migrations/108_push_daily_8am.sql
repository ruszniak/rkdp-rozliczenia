-- Poranny plan dnia o 8:00 czasu polskiego (zimą i latem): harmonogram o 6:00 i 7:00 UTC,
-- funkcja push wysyła tylko wtedy, gdy w Warszawie jest 8:00.
select cron.alter_job((select jobid from cron.job where jobname = 'push-daily'), schedule := '0 6,7 * * 1-5');
