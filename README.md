# Zero Resztek

Planer posiłków, który układa jadłospis tak, żeby składniki rozeszły się
do **pełnych opakowań ze sklepu**, a to co mimo wszystko zostanie, było zużyte
w kolejnym tygodniu.

Teza: marnowanie w domach nie bierze się z tego, że ludzie źle gotują, tylko
z rozjazdu między przepisem a gramaturą opakowania. Przepis chce 200 g śmietany,
sklep sprzedaje 400 g. Reszta zostaje otwarta w lodówce i się psuje.

## Stan prac

Zrobione: **punkty 1 do 6**, czyli cały zakres wersji pierwszej. Rdzeń
(model danych, seed, optymalizacja) plus sześć ekranów na Expo.

| | |
|---|---|
| Produkty w seedzie | 87 |
| Przepisy w seedzie | 86 |
| Testy jednostkowe | 124, wszystkie przechodzą |
| Czas generowania planu | ~18 ms przy limicie 500 ms |
| Dobór planu | wyszukiwanie lokalne, 8 restartów |

## Uruchomienie

Wymaga Node 22.18 lub nowszego. Testy chodzą na wbudowanym `node --test`
i natywnym usuwaniu typów, więc do samego rdzenia nie ma żadnych zależności
runtime. TypeScript jest tylko po to, żeby sprawdzić typy.

```bash
npm install
npm test          # 124 testy
npm run typecheck # tsc --noEmit
npm run demo      # dwa warianty ze specyfikacji
npm run check     # typy + testy
npm run walidacja # optymalizator kontra losowy dobór, 200 konfiguracji
npm run eksport   # produkty.csv do sprawdzenia gramatur w sklepie
npm start         # Expo, telefon przez Expo Go
npm run web       # wersja webowa w przeglądarce, do testów na komputerze
npm run android   # emulator lub podłączony telefon
```

## Testowanie na komputerze, bez telefonu

Symulatora iOS na Windowsie nie ma i nie będzie, to ograniczenie Apple.
Najbliżej prawdy bez telefonu jest wersja webowa oglądana w oknie o proporcjach
telefonu:

```bash
npm run web
```

Potem otwórz **http://localhost:8081/podglad.html** zamiast samego `/`.
To ramka telefonu z wyborem rozmiaru (iPhone SE, 15, 15 Pro Max, mały Android),
przyciskiem przeładowania i przyciskiem czyszczenia danych, żeby wrócić do stanu
świeżej instalacji.

Czego ten podgląd **nie** pokaże: różnic w czcionkach, wysokości zakładek
i bezpiecznych marginesach na prawdziwym iOS. Logika, teksty i przepływ ekranów
są prawdziwe, wygląd tylko przybliżony.

Bundle Androida buduje się czysto (`npx expo export --platform android`,
2,8 MB Hermes), więc Metro radzi sobie z importami `.ts` i z JSON-em.

Node jest zainstalowany przenośnie i **nie ma go w PATH**:

```powershell
$env:PATH = "$env:USERPROFILE\.local\node;$env:PATH"
```

## Układ

```
src/core/            czysty TypeScript, ZERO importów z Reacta
  types.ts           model domenowy
  packaging.ts       wycena, zaokrąglanie do opakowań, liczenie strat
  optimizer.ts       dobór planu tygodnia, dania przypięte
  pantry.ts          spiżarnia, gotowanie, cofanie i korekta zużycia
  feasibility.ts     wykonalność przepisu i progi tolerancji niedoboru
assets/recipes/      miejsce na zdjęcia dań, patrz README w środku
src/data/
  photos.ts          skąd brać zdjęcie dania
  store.ts           JEDYNE miejsce dotykające magazynu danych
  ids.ts             uuid z klienta
  seed/products.json 60 produktów, DANE a nie kod
  seed/recipes.json  29 przepisów, DANE a nie kod
  seed/index.ts      ładowarka JSON
app/                 ekrany, expo-router
  (tabs)/index       1 konfiguracja + 2 plan tygodnia
  (tabs)/przepisy    lista przepisów w kartach, z filtrami
  (tabs)/zakupy      3 lista zakupów
  przepis/[id]       4 szczegóły przepisu
  (tabs)/spizarnia   5 spiżarnia z ręczną korektą
  (tabs)/podsumowanie 6 podsumowanie tygodnia
  produkt            ręczne dopisanie produktu
  korekta/[id]       korekta zużytych ilości
src/state/           React Context, jedyny łącznik rdzenia z ekranami
src/ui/              tokeny wyglądu, komponenty, formatowanie po polsku
tests/               testy jednostkowe
scripts/demo.ts      kontrolny wydruk dwóch wariantów
supabase/            docelowy schemat, NIE uruchamiany w wersji pierwszej
```

## Katalog jest budowany, nie zaszyty

Gramatury i ceny nie istnieją nigdzie w logice. Żywy katalog składa `store.ts`
z trzech warstw:

1. seed z `products.json` i `recipes.json`
2. produkty dopisane ręcznie przez użytkownika (`addCustomProduct`)
3. jego poprawki cen i gramatur (`setProductPrice`, `setProductPackSize`)

Poprawki da się cofnąć do wartości z seeda przez `resetProductOverrides`.
Produktów z seeda nie można usunąć, własne owszem.

## Zdjęcia dań

Slot na zdjęcie jest gotowy i sprawdzony, zdjęć jeszcze nie ma. Miniatura
64 × 64 na liście, pasek 16:9 na ekranie szczegółów. Bez zdjęcia widać
neutralne pole i nic się nie psuje.

Dwie drogi, sprawdzane w tej kolejności:

1. **Plik w paczce.** Wrzuć obraz do `assets/recipes/`, dopisz jedną linijkę
   w [photos.ts](src/data/photos.ts). Działa offline. Metro wymaga ścieżki
   wpisanej na sztywno, dlatego mapa jest prowadzona ręcznie.
2. **Adres w sieci.** Ustaw `photoUrl` przy przepisie w `recipes.json`.
   Plik z paczki ma pierwszeństwo. Gdy obraz się nie wczyta, wraca neutralne pole.

Zdjęcia są ozdobne. Nigdy nie blokują ekranu ani układania planu, więc wymóg
działania offline zostaje spełniony.

## Dobór planu

Przy 86 przepisach i 5 daniach kombinacji jest prawie 35 milionów, więc pełny
przegląd odpada. Powyżej 300 000 kombinacji działa **wyszukiwanie lokalne**:
osiem losowych startów, potem wspinaczka po sąsiadach, czyli podmiana jednego
dania na najlepsze możliwe, aż przestanie się poprawiać.

Punkt odniesienia dla „ile zostałoby przy zakupach na oko" liczy się z **osobnego,
równomiernego losowania 400 kombinacji**. Gdyby brać średnią z kombinacji
odwiedzonych przez wspinaczkę, byłaby zaniżona, bo wspinaczka odwiedza głównie
te dobre.

Skuteczność sprawdza `npm run walidacja`: 200 losowych konfiguracji, dla każdej
50 losowych planów. Wynik na obecnej bazie to 85% mniej strat i 56 zł niższy
rachunek, bilans netto +81 zł na tydzień, zero przypadków na minusie.

## Stałe zakupy i ręczne dokupki

Jedna arytmetyka dla obu:

```
potrzebaCalkowita = potrzebaZPrzepisow + potrzebaStala
paczki            = ceil(max(0, potrzebaCalkowita - stanWSpizarni) / rozmiar)
```

Sumowanie zachodzi **przed** policzeniem opakowań, nie po. Dzięki temu mleko
na śniadania i mleko do naleśników pochodzą z tego samego kartonu.

Stałe zakupy wracają co tydzień, ręczne dokupki znikają przy układaniu nowego
planu. Na liście zakupów jedne i drugie trafiają do swoich normalnych kategorii,
bez osobnej sekcji, bo z punktu widzenia sklepu to zwykłe zakupy.

## Tolerancja niedoboru

Progi żyją jako stałe w [feasibility.ts](src/core/feasibility.ts) i nigdzie indziej.

Składnik jest **tolerowany**, gdy zachodzi którykolwiek warunek:

| Warunek | Stała |
|---|---|
| niedobór to najwyżej 15% zapotrzebowania | `SHORTFALL_TOLERANCE_RATIO` |
| niedobór to najwyżej 5 g albo 5 ml | `SHORTFALL_TOLERANCE_ABSOLUTE` |
| produkt jest z kategorii przyprawy | `ALWAYS_TOLERATED_CATEGORY` |

Próg kwotowy celowo nie działa na sztuki, bo jajka nie da się połowić.

Bursztyn `#B45309` pojawia się **wyłącznie** przy statusie `prawie`.
Status `brak` zostaje neutralny i nigdy nie jest czerwony.

## Zużycie jest zapisywane, nie wyliczane

Pozycja planu trzyma `consumption`, czyli ile faktycznie zeszło ze spiżarni
w chwili oznaczenia dania jako ugotowane. To **jedyne źródło prawdy** dla
cofnięcia i korekty. Gdyby cofnięcie wyliczało ilości z przepisu, to po
wcześniejszej korekcie zwróciłoby do spiżarni złe wartości.

## Trzy decyzje, które łatwo zepsuć

**1. Spiżarnia odejmowana PRZED zaokrągleniem do opakowań.**
Potrzeba 600 g, w domu 300 g, opakowanie 400 g. Poprawnie: brakuje 300 g,
czyli jedno opakowanie. Odwrotna kolejność dałaby dwa.

**2. Strata liczona wyłącznie dla `perishable`.**
Resztka ryżu, makaronu czy oleju wraca do spiżarni i zostanie zużyta, więc
nie jest stratą. Strata to otwarta śmietana, nadgryziony pęczek natki, pół
puszki kukurydzy. Bez tego rozróżnienia algorytm optymalizuje nie to co trzeba.

**3. Bonus za zapasy ma wagę 1.5, wyżej niż waga strat.**
Celowo. Coś, co już leży otwarte w lodówce, psuje się teraz, więc zużycie tego
jest pilniejsze niż uniknięcie nowej resztki. Dzięki temu plan sam sprząta
po poprzednim tygodniu.

## Nazewnictwo, polski kontra angielski

Specyfikacja jest tu wewnętrznie sprzeczna: podaje kształt wyniku z polskimi
nazwami pól, a w wymaganiach jakościowych żąda kodu po angielsku.

Wybrane rozwiązanie: **pola w kodzie po angielsku, teksty na ekranie po polsku,
kolumny w bazie po polsku** zgodnie ze spec. Mapowanie:

| Specyfikacja / baza | Kod TypeScript |
|---|---|
| `nazwa` | `name` |
| `kategoria` | `category` |
| `jednostka` | `unit` |
| `sprzedaz` | `soldAs` |
| `rozmiar_opakowania` | `packSize` |
| `cena_orientacyjna` | `price` |
| `psuje_sie` | `perishable` |
| `listaZakupow` | `shoppingList` |
| `liczbaOpakowan` | `packCount` |
| `ilePotrzebne` | `needed` |
| `ileZeSpizarni` | `fromPantry` |
| `ileZostanie` | `leftover` |
| `kosztPozycji` | `itemCost` |
| `kosztCalkowity` | `totalCost` |
| `wartoscResztek` | `leftoverValue` |
| `wartoscResztekPrzySrednimPlanie` | `averagePlanLeftoverValue` |
| `oszczednosc` | `savings` |

Wartości słownikowe zostają polskie (`opakowanie`, `luz`, `nabial`, `laktoza`),
bo trafiają wprost do bazy i na ekran.

## Granica bezpieczeństwa

Aplikacja **pod żadnym pozorem nie ocenia, czy produkt jest jeszcze zdatny
do spożycia.** Żadnych ostrzeżeń o psuciu się, sugestii wyrzucenia ani
interpretacji dat przydatności. `addedAt` w spiżarni to wyłącznie neutralna
informacja. To kwestia bezpieczeństwa żywności i jest świadomie poza zakresem.

## Co dalej

Punkty 3 do 6: ekran konfiguracji i planu, lista zakupów zasilająca spiżarnię,
szczegóły przepisu z odejmowaniem, spiżarnia i podsumowanie. Projekt graficzny
sześciu ekranów istnieje, zrobiony w Claude Design.

Zakres wersji pierwszej jest zamknięty. Poza nim, świadomie:

- brak logowania i kont, dane tylko lokalnie
- brak oceny świeżości i dat przydatności
- brak skanowania paragonów i kodów kreskowych
- brak funkcji społecznościowych i powiadomień
- brak dodawania własnych przepisów przez użytkownika

Do zrobienia przy okazji: ekran edycji ceny i gramatury produktu z seeda
(`setProductPrice`, `setProductPackSize` są gotowe i przetestowane, brakuje
im tylko ekranu).
