-- Zero Resztek — docelowy schemat Supabase.
--
-- W WERSJI PIERWSZEJ TEN PLIK NIE JEST URUCHAMIANY.
-- Dane siedzą lokalnie w AsyncStorage, obsługiwane przez src/data/store.ts.
-- Schemat istnieje po to, żeby dołożenie kont nie wymagało przepisywania modelu.
--
-- Nazwy kolumn są polskie, zgodnie ze specyfikacją. Kod TypeScript używa nazw
-- angielskich (wymaganie jakościowe "kod i nazwy zmiennych po angielsku").
-- Mapowanie 1:1 opisuje README.md.

-- ---------------------------------------------------------------------------
-- Dane referencyjne (seed). Nie są tworzone przez użytkownika, więc klucz
-- jest czytelnym slugiem, a nie uuid — łatwiej utrzymać i debugować.
-- ---------------------------------------------------------------------------

create table if not exists produkty (
  id                  text primary key,          -- 'smietana-18'
  nazwa               text not null,             -- 'Śmietana 18%'
  kategoria           text not null check (kategoria in (
                        'warzywa','nabial','mieso','sypkie',
                        'konserwy','mrozonki','pieczywo','przyprawy')),
  jednostka           text not null check (jednostka in ('g','ml','szt')),
  sprzedaz            text not null check (sprzedaz in ('opakowanie','luz')),
  rozmiar_opakowania  numeric,                   -- null wyłącznie gdy sprzedaz = 'luz'
  cena_orientacyjna   numeric not null,          -- za opakowanie, albo za 1000 przy luzie
  psuje_sie           boolean not null default false,
  zweryfikowane       boolean not null default false,  -- gramatura sprawdzona w sklepie

  constraint rozmiar_tylko_dla_opakowan check (
    (sprzedaz = 'luz'        and rozmiar_opakowania is null) or
    (sprzedaz = 'opakowanie' and rozmiar_opakowania > 0)
  )
);

create table if not exists przepisy (
  id             text primary key,
  nazwa          text not null,
  porcje_bazowe  int not null check (porcje_bazowe > 0),
  czas_minut     int not null check (czas_minut > 0),
  instrukcje     text not null default '',
  tagi           text[] not null default '{}',
  kategoria_glowna text not null,                -- podstawa kary za powtórzenia
  kategoria_dania  text not null default 'inne', -- tylko do grupowania na liście
  zdjecie_url      text                          -- null gdy brak
);

create table if not exists przepis_skladniki (
  przepis_id  text not null references przepisy(id) on delete cascade,
  produkt_id  text not null references produkty(id),
  ilosc       numeric not null check (ilosc > 0), -- w jednostce produktu, dla porcje_bazowe
  primary key (przepis_id, produkt_id)
);

-- ---------------------------------------------------------------------------
-- Rekordy tworzone przez użytkownika.
--
-- Zasady, które muszą być spełnione od pierwszego dnia:
--   1. uuid generowany PO STRONIE KLIENTA, nigdy autoinkrement
--   2. user_id nullowalne, w wersji pierwszej zawsze null
-- ---------------------------------------------------------------------------

-- Produkty dopisane ręcznie przez użytkownika. Ta sama struktura co produkty,
-- ale z uuid z klienta i nullowalnym user_id.
create table if not exists produkty_wlasne (
  id                  uuid primary key,
  user_id             uuid references auth.users(id) on delete cascade,  -- NULLOWALNE
  nazwa               text not null,
  kategoria           text not null,
  jednostka           text not null check (jednostka in ('g','ml','szt')),
  sprzedaz            text not null check (sprzedaz in ('opakowanie','luz')),
  rozmiar_opakowania  numeric,
  cena_orientacyjna   numeric not null check (cena_orientacyjna >= 0),
  psuje_sie           boolean not null default false,
  zweryfikowane       boolean not null default true,  -- gramaturę podał użytkownik

  constraint wlasne_rozmiar_tylko_dla_opakowan check (
    (sprzedaz = 'luz'        and rozmiar_opakowania is null) or
    (sprzedaz = 'opakowanie' and rozmiar_opakowania > 0)
  )
);

-- Poprawki użytkownika do produktów z seeda. Ceny się zmieniają, gramatury
-- bywają lokalne, więc jedno i drugie musi być edytowalnym parametrem.
create table if not exists produkty_poprawki (
  user_id             uuid references auth.users(id) on delete cascade,  -- NULLOWALNE
  produkt_id          text not null references produkty(id) on delete cascade,
  cena_orientacyjna   numeric check (cena_orientacyjna >= 0),
  rozmiar_opakowania  numeric check (rozmiar_opakowania > 0),
  primary key (user_id, produkt_id)
);

create table if not exists spizarnia (
  id           uuid primary key,                 -- z klienta, nie gen_random_uuid()
  user_id      uuid references auth.users(id) on delete cascade,  -- NULLOWALNE
  produkt_id   text not null references produkty(id),
  ilosc        numeric not null check (ilosc >= 0),
  data_dodania timestamptz not null default now(),
  zrodlo       text not null check (zrodlo in ('zakupy','reczne'))
);

-- Uwaga: data_dodania to informacja NEUTRALNA. Aplikacja pod żadnym pozorem
-- nie wnioskuje z niej o przydatności produktu do spożycia.

create table if not exists plany (
  id             uuid primary key,
  user_id        uuid references auth.users(id) on delete cascade,  -- NULLOWALNE
  data_utworzenia timestamptz not null default now(),
  osoby          int not null check (osoby > 0),
  -- Pozycje planu razem ze stanem: ugotowane, przypięte, naIleDni, porcje
  -- oraz zapisanym zużyciem.
  pozycje        jsonb not null default '[]',
  kupione        text[] not null default '{}',   -- id produktów odhaczonych jako kupione
  pominiete      text[] not null default '{}'    -- id produktów "mam już w domu"
);

-- Produkty kupowane co tydzień niezależnie od planu, głównie na śniadania.
-- Wchodzą do sumy zapotrzebowania PRZED policzeniem opakowań, nie po.
create table if not exists stale_zakupy (
  id              uuid primary key,
  user_id         uuid references auth.users(id) on delete cascade,  -- NULLOWALNE
  produkt_id      text not null references produkty(id) on delete cascade,
  liczba_opakowan numeric not null check (liczba_opakowan > 0)
);

-- Zamknięte tygodnie. Archiwizacja następuje w chwili wygenerowania
-- nowego planu.
create table if not exists historia_tygodni (
  id                        uuid primary key,
  user_id                   uuid references auth.users(id) on delete cascade,  -- NULLOWALNE
  data_od                   date not null,
  data_do                   date not null,
  dania                     jsonb not null default '[]',
  koszt                     numeric not null default 0,
  wartosc_resztek_prognoza  numeric not null default 0,
  -- Liczona wyłącznie z produktów psujących się, które zostały w spiżarni.
  -- null dopóki tydzień się nie zamknie.
  wartosc_resztek_faktyczna numeric
);

create index if not exists spizarnia_user_idx on spizarnia(user_id);
create index if not exists stale_zakupy_user_idx on stale_zakupy(user_id);
create index if not exists historia_user_idx on historia_tygodni(user_id);
create index if not exists plany_user_idx on plany(user_id);

-- ---------------------------------------------------------------------------
-- RLS. Włączyć dopiero razem z kontami. Przy user_id = null (wersja pierwsza)
-- te polityki nic nie przepuszczą, więc nie włączaj ich przedwcześnie.
-- ---------------------------------------------------------------------------

-- alter table spizarnia enable row level security;
-- alter table plany     enable row level security;
--
-- create policy "wlasna spizarnia" on spizarnia
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "wlasne plany" on plany
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
