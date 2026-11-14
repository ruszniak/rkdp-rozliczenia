-- Klienci-osoby (RKDP: JDG, M2 TAX: osoba fizyczna): nazwa jednolicie „Nazwisko Imię”, tylko pierwsze litery wielkie.
-- Działa automatycznie przy dodaniu i zmianie klienta. Nazwy wyglądające na firmowe (cyfry, cudzysłowy, kropki, więcej niż 3 człony)
-- zostają bez zmian; kolejność zmieniamy tylko, gdy pierwszy człon jest rozpoznanym imieniem.
create or replace function public.person_first_name(w text) returns boolean language sql immutable as $$
  select lower(w) = any(array['adam','adrian','agata','agnieszka','aleksander','aleksandra','aliaksandr','aliaksei','alicja','alina','amelia','anastasia','anastasiia','andrii','andriy','andrzej','aneta','angelika','anna','antoni','antonina','arkadiusz','artem','artur','barbara','bartosz','bartłomiej','beata','bogdan','bogusław','bohdan','bożena','cezary','czesław','damian','daniel','danuta','dariusz','dawid','denis','denys','dmitry','dmytro','dominik','dominika','dorota','edyta','elżbieta','emil','emilia','eugen','ewa','ewelina','filip','franciszek','gabriela','grażyna','grzegorz','halina','halyna','hanna','helena','henryk','hubert','igor','ilona','inna','irena','iryna','ivan','iwona','izabela','jacek','jadwiga','jakub','jan','janina','janusz','jarosław','jerzy','joanna','jolanta','julia','julian','justyna','józef','kacper','kamil','kamila','karol','karolina','katarzyna','kateryna','kazimierz','kinga','klaudia','konrad','krystian','krystyna','krzysztof','laura','lech','leszek','lidia','liudmyla','lucyna','ludwik','maciej','magdalena','maja','maksym','marcin','marek','maria','marian','marianna','mariia','mariusz','marta','martyna','maryna','mateusz','maxim','małgorzata','michał','mieczysław','mikołaj','milena','mirosław','mirosława','monika','mykola','natalia','natalie','nataliia','nikodem','nikola','norbert','oksana','oleg','oleksandr','oleksii','olena','olga','oliwer','oliwia','patrycja','patryk','paula','paulina','pavlo','paweł','petro','piotr','przemysław','radosław','rafał','renata','robert','roman','ruslan','ryszard','sabina','sebastian','sergey','sergii','serhii','siarhei','stanisław','stefan','svitlana','sylwia','szymon','tadeusz','tamara','taras','tatsiana','teresa','tetiana','tetyana','tomasz','uladzimir','urszula','vasyl','viktoria','viktoriia','vitalii','vladimir','vladislav','vladislavs','vladyslav','volha','volodymyr','wanda','weronika','wiesław','wiktor','wiktoria','witold','wojciech','władysław','włodzimierz','yevhen','yulia','yuliia','yuri','yurii','zbigniew','zdzisław','zenon','zofia','zuzanna','zygmunt','łukasz']::text[])
$$;

create or replace function public.person_name_norm(n text) returns text language plpgsql immutable as $$
declare p text[]; t text;
begin
  t := btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g'));
  if t = '' or t ~ '[0-9"„”.,()&/@]' then return n; end if;
  p := string_to_array(t, ' ');
  if array_length(p, 1) not between 2 and 3 then return n; end if;
  -- tylko pierwsze litery wielkie (też w nazwiskach dwuczłonowych z łącznikiem)
  t := initcap(lower(t));
  p := string_to_array(t, ' ');
  -- „Imię Nazwisko” → „Nazwisko Imię”
  if array_length(p, 1) = 2 and public.person_first_name(p[1]) and not public.person_first_name(p[2]) then
    t := p[2] || ' ' || p[1];
  elsif array_length(p, 1) = 3 and public.person_first_name(p[1]) and public.person_first_name(p[2]) and not public.person_first_name(p[3]) then
    t := p[3] || ' ' || p[1] || ' ' || p[2];
  end if;
  return t;
end $$;

create or replace function public.clients_person_name() returns trigger language plpgsql as $$
begin
  if new.legal_form = 'jdg' then new.name := public.person_name_norm(new.name); end if;
  return new;
end $$;
create or replace trigger clients_person_name before insert or update of name, legal_form on public.clients
  for each row execute function public.clients_person_name();

create or replace function public.m2_clients_person_name() returns trigger language plpgsql as $$
begin
  if new.kind = 'osoba' then new.name := public.person_name_norm(new.name); end if;
  return new;
end $$;
create or replace trigger m2_clients_person_name before insert or update of name, kind on public.m2_clients
  for each row execute function public.m2_clients_person_name();
