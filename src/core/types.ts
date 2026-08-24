/**
 * Model domenowy. Nazwy pol po angielsku (wymaganie jakosciowe), wartosci
 * slownikowe po polsku, bo trafiaja wprost do bazy i na ekran.
 *
 * Mapowanie na kolumny Supabase opisuje supabase/schema.sql.
 */

export type Category =
  | 'warzywa'
  | 'nabial'
  | 'mieso'
  | 'sypkie'
  | 'konserwy'
  | 'mrozonki'
  | 'pieczywo'
  | 'przyprawy';

/** Kolejnosc obchodzenia sklepu. Uzywana do sortowania listy zakupow. */
export const CATEGORY_ORDER: readonly Category[] = [
  'warzywa',
  'nabial',
  'mieso',
  'sypkie',
  'konserwy',
  'mrozonki',
  'pieczywo',
  'przyprawy',
];

export type Unit = 'g' | 'ml' | 'szt';

/** "opakowanie" = kupujesz caloscia, "luz" = kupujesz dokladnie tyle ile trzeba. */
export type SoldAs = 'opakowanie' | 'luz';

/**
 * Tagi przepisu. Sluza wylacznie twardemu filtrowaniu wykluczen
 * ("czego nie jecie"), nigdy miekkim preferencjom.
 */
export type DietTag =
  | 'wegetarianskie'
  | 'weganskie'
  | 'drob'
  | 'wieprzowina'
  | 'wolowina'
  | 'ryba'
  | 'laktoza'
  | 'gluten'
  | 'orzechy'
  | 'jajka';

/**
 * Kategoria dania. Sluzy WYLACZNIE do grupowania w zakladce Przepisy.
 * Nie ma zadnego wplywu na optymalizacje.
 */
export type DishCategory =
  | 'makarony'
  | 'miesne'
  | 'wegetarianskie'
  | 'zupy'
  | 'szybkie'
  | 'inne';

export const DISH_CATEGORY_ORDER: readonly DishCategory[] = [
  'szybkie',
  'makarony',
  'miesne',
  'wegetarianskie',
  'zupy',
  'inne',
];

/** Skladnik dominujacy w daniu. Podstawa kary za powtorzenia w planie. */
export type MainCategory =
  | 'mielone'
  | 'drob'
  | 'wieprzowina'
  | 'ryba'
  | 'jajka'
  | 'warzywa'
  | 'nabial';

export interface Product {
  id: string;
  /** Nazwa widoczna dla uzytkownika, np. "Smietana 18%". */
  name: string;
  category: Category;
  unit: Unit;
  soldAs: SoldAs;
  /** Gramatura opakowania. null wylacznie dla soldAs === 'luz'. */
  packSize: number | null;
  /**
   * Cena orientacyjna w PLN: za opakowanie, albo za LOOSE_PRICE_BASE
   * jednostek gdy produkt sprzedawany luzem. Parametr edytowalny.
   */
  price: number;
  /**
   * Czy resztka po otwarciu sie zmarnuje. Decyduje o tym, czy resztka
   * w ogole liczy sie jako strata. Ryz i makaron: false. Smietana: true.
   */
  perishable: boolean;
  /**
   * Czy gramature opakowania ktos sprawdzil w sklepie.
   * Domyslnie false, bo dane startowe sa z glowy, nie z polki.
   */
  verified: boolean;
}

export interface RecipeIngredient {
  productId: string;
  /** Ilosc w jednostce produktu, podana dla Recipe.baseServings porcji. */
  amount: number;
}

export interface Recipe {
  id: string;
  name: string;
  baseServings: number;
  timeMinutes: number;
  instructions: string;
  tags: DietTag[];
  mainCategory: MainCategory;
  /** Tylko do grupowania na liscie przepisow. */
  dishCategory: DishCategory;
  /**
   * Adres zdjecia w sieci. null oznacza brak.
   *
   * Zdjecie jest OZDOBNE. Nigdy nie blokuje ekranu i nigdy nie jest potrzebne
   * do ulozenia planu, wiec wymog dzialania offline zostaje spelniony.
   * Plik wgrany do assets/recipes ma pierwszenstwo przed tym adresem.
   */
  photoUrl: string | null;
  ingredients: RecipeIngredient[];
}

/** Ile faktycznie zeszlo ze spizarni przy gotowaniu jednego dania. */
export interface ConsumptionLine {
  productId: string;
  amount: number;
}

/**
 * Pozycja planu tygodnia.
 *
 * `consumption` jest ZRODLEM PRAWDY dla cofniecia i korekty. Nigdy nie
 * wyliczaj z przepisu tego, co ma wrocic do spizarni, bo uzytkownik mogl
 * te ilosci wczesniej poprawic.
 */
export interface PlanEntry {
  recipeId: string;
  cooked: boolean;
  /** Danie przypiete recznie. Optymalizator go nie rusza. */
  pinned: boolean;
  consumption: ConsumptionLine[] | null;
  /**
   * Na ile dni starcza to konkretne danie. Domyslnie globalne `daysPerDish`.
   * Zmiana przelicza liste zakupow, ale NIE uruchamia optymalizatora,
   * zeby nie podmienic dan, ktore uzytkownik juz zaakceptowal.
   */
  daysCovered: number;
  /** Na ile porcji gotujemy to danie. Domyslnie globalna liczba osob. */
  servings: number;
}

/** Skalowanie pojedynczego dania: ile porcji i na ile dni. */
export interface MealScaling {
  servings: number;
  daysCovered: number;
}

/** Uproszczony stan spizarni, tyle ile potrzebuje modul optymalizacji. */
export interface PantryEntry {
  productId: string;
  amount: number;
}

export interface PantryItem {
  /** UUID generowany po stronie klienta, nigdy autoinkrement. */
  id: string;
  /** Nullowalne od poczatku. W wersji pierwszej zawsze null. */
  userId: string | null;
  productId: string;
  amount: number;
  /**
   * Data dodania. Informacja neutralna. Aplikacja nigdy nie wnioskuje
   * z niej o przydatnosci produktu do spozycia.
   */
  addedAt: string;
  source: 'zakupy' | 'reczne';
}

export interface Catalog {
  products: Product[];
  recipes: Recipe[];
}
