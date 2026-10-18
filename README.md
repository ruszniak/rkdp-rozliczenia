# RKDP · Rozliczenia

Wewnętrzna aplikacja RKDP do śledzenia, czy klienci biura są rozliczeni w danym miesiącu
(księgowanie, lista płac, ZUS, PIT/CIT, VAT, JPK, WB), z kartą klienta (kontakt, forma
opodatkowania, ZUS, VAT, CIT, wspólnicy) i historią zmian.

- Frontend: statyczne HTML + JavaScript (bez frameworka), publikowany na Vercelu.
- Backend: Supabase (PostgreSQL w regionie UE, logowanie kodem z e-maila).
- Bezpieczeństwo: Row Level Security w bazie. Logować się mogą tylko adresy z tabeli
  `team_members`; osoby z rolą `limited` widzą wyłącznie przypisanych klientów.

## Role

| Rola      | Kto (start)            | Uprawnienia                                         |
|-----------|------------------------|-----------------------------------------------------|
| `admin`   | Michał                 | wszystko + zespół, przypisania, kolumny, usuwanie   |
| `full`    | Natalia, Patrycja      | wszyscy klienci, edycja kart i statusów             |
| `limited` | Jakub, Weronika        | tylko przypisani klienci, zmiana statusów i uwag    |

## Wdrożenie

### 1. Supabase
1. Nowy projekt w regionie **Central EU (Frankfurt)**.
2. **SQL Editor** → wklej `supabase/schema.sql` → Run. Potem plik importu danych (przekazywany poza repozytorium).
3. **Authentication → Emails → Templates**: w szablonach *Magic link* i *Confirm signup* wstaw kod `{{ .Token }}`, np.:
   `<h2>Kod logowania RKDP</h2><p>Twój kod: <b style="font-size:24px">{{ .Token }}</b></p><p>Kod jest ważny 10 minut.</p>`
4. **Authentication → Emails → SMTP Settings**: własny SMTP (np. Google Workspace: `smtp.gmail.com`, port 587,
   login skrzynki + hasło aplikacji). Bez tego Supabase wysyła maile tylko do członków projektu.
5. **Authentication → Sign In / Providers → Email**: Email OTP expiration = 600 s.
6. **Authentication → URL Configuration**: Site URL = adres aplikacji.
7. **Project Settings → API**: skopiuj *Project URL* i klucz *anon / publishable* (nigdy `service_role`).

### 2. Vercel
1. Import repozytorium, Framework Preset: **Other** (ustawienia budowania są w `vercel.json`).
2. Environment Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Deploy. Opcjonalnie domena, np. `rozliczenia.rkdp.pl` (CNAME → `cname.vercel-dns.com`).

## Jak to działa
- **Otwórz miesiąc** tworzy listę dla aktywnych klientów. „Nie dotyczy” ustawia się z profilu
  (VAT kwartalny poza końcem kwartału, CIT estoński, zaliczki kwartalne, brak pracowników itd.);
  gdy profil jest pusty — przejmuje układ z poprzedniego miesiąca razem z osobą przypisaną.
- Zmiany widać u wszystkich na żywo; każda zmiana trafia do historii (kto, kiedy, co).
- Eksport do Excela (CSV) z widoku miesiąca i listy klientów.

Wykonanie: [druslak](https://ruszniak.io)

## Kopie zapasowe

**Automatyczna (co noc, ok. 3:15)** – `.github/workflows/kopia-bazy.yml` robi zrzut schematu `public` z danymi,
szyfruje go (AES-256, gpg) i zapisuje jako artefakt przebiegu w zakładce *Actions* (przechowywany 90 dni).
Jednorazowa konfiguracja w GitHub → Settings → Secrets and variables → Actions → *New repository secret*:

- `SUPABASE_DB_URL` – Supabase → *Connect* → *Session pooler* → URI, z wpisanym hasłem do bazy,
- `BACKUP_PASSPHRASE` – własne długie hasło (min. 16 znaków), zapisane w menedżerze haseł.

Odtworzenie:

```bash
gpg --decrypt rkdp-baza-RRRR-MM-DD_GG-MM.dump.gpg > baza.dump
pg_restore --list baza.dump                                  # podgląd zawartości
pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" baza.dump   # nadpisuje bazę!
```

**Ręczna** – Zespół i ustawienia → *Pobierz kopię danych* (tylko administrator): ZIP z `dane.json` i `dane.xlsx`.

## Logowanie

Hasło + kod z e-maila (migracja `006_logowanie_haslo_kod.sql`). Dostęp do danych egzekwuje baza: `current_member_id()`
zwraca osobę tylko dla sesji potwierdzonej w `auth_verified_sessions` (hasło + kod, hasło + zapamiętana przeglądarka
albo kod + właśnie ustawione hasło) i aktywnej w ciągu `session_idle_minutes`. Hasło można ustawić tylko przy
`team_members.can_set_password = true` (trigger na `auth.users`), więc sam dostęp do skrzynki e-mail nie wystarczy
do zmiany hasła. Administrator zarządza tym w *Zespół i ustawienia* (kolumna „Logowanie”, sekcja „Bezpieczeństwo logowania”).

Gdy administrator zgubi hasło i nie ma drugiego administratora – w Supabase → SQL Editor:
`update public.team_members set can_set_password = true where email = 'michal@ruszniak.io';`
