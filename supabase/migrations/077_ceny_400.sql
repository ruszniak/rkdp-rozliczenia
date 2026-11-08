-- wszystkie płatne konsultacje po 400 zł brutto – niezależnie od strony, z której klient się umawia
update public.meeting_types set price_rkdp = 400 where price_rkdp = 300;
