# rdp.app – zasady pracy nad repozytorium

## Instrukcje dla użytkowników – aktualizować przy każdej zmianie
Aplikacja ma trzy instrukcje ze zrzutami ekranu (linki w aplikacji: Więcej → Pomoc i instrukcje, strona zbiorcza `/pomoc/`):
- `public/pomoc/ksiegowosc/` – zespół księgowy RKDP (moduł `rozliczenia`),
- `public/pomoc/doradca/` – doradcy M2 TAX (moduł `doradztwo`),
- `public/pomoc/partner/` – biura partnerskie (moduł `partner`).

Gdy zmieniasz coś, co widzi użytkownik (nowa funkcja, inny przycisk, inna nazwa, inny przebieg):
1. Popraw tekst w instrukcji, której to dotyczy (i datę „aktualizacja” w nagłówku), a gdy zmienia się wygląd – podmień zrzut ekranu w `public/pomoc/img/` (JPEG q≈84, maks. 1600 px szerokości, tylko dane fikcyjne z wersji demo).
2. Dopisz zmianę do historii „Co nowego” w `public/js/views/oaplikacji.js` (NEWS, APP_VERSION, APP_DATE).
3. Przy większych zmianach dla zespołu dodaj ogłoszenie do tabeli `ogloszenia` (title, items jsonb – lista punktów, audience – id osób z `team_members`). Po dodaniu ludzie dostają push i e-mail, a po zalogowaniu okno „Co nowego” (do „Rozumiem”). Treść dopasuj do modułu odbiorców (RKDP / M2 TAX / partnerzy).

Zrzuty ekranu: wersja demo (`public/demo`) + nakładka do zrzutów (folder `_shot`, poza repozytorium – nie commitować `public/_shot`).

## Wygląd stron dla klientów
Strony z linków (podpis, UPL-1, wgrywanie, instrukcje, regulamin) mają wspólny styl w `public/umow/doc.css`: biała strona, nagłówki Lora (`/fonts/pdf/Lora-SemiBold.woff`), tekst czcionką systemową, cienkie linie, akcent brązowy #7A5A37, przyciski grafitowe. Bez emoji, gradientów, „pigułek”, ozdobnych teł i napisów WERSALIKAMI z rozstrzeleniem. Czcionki tylko z własnego serwera (bez Google Fonts). Oferta (`public/js/offers/offer.js`) – ten sam charakter.

## Inne zasady
- Komunikacja z właścicielem po polsku; nazwa aplikacji: rdp.app.
- Przed push: `git pull --rebase` (repo zmienia też inna sesja). Przy zmianie frontendu podbij `CACHE` w `public/sw.js`.
- Klucz service_role i sekrety nigdy we frontendzie ani w czacie. PESEL zespołu tylko w `member_private`, PESEL osób klienta tylko w `client_person_pesel` (nigdzie indziej).
