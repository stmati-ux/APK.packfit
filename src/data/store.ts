import type { Catalog, DietTag, PlanEntry, PantryItem, Product, Recipe } from '../core/types.ts';
import { SEED_PRODUCTS, SEED_RECIPES } from './seed/index.ts';
import { newId } from './ids.ts';

/**
 * JEDYNE miejsce, ktore dotyka magazynu danych.
 *
 * Komponenty nie ruszaja AsyncStorage bezposrednio. Podmiana magazynu
 * lokalnego na Supabase ma byc zmiana w tym jednym pliku.
 *
 * Katalog NIE jest staly. Sklada sie z trzech warstw:
 *   1. seed z plikow JSON
 *   2. produkty dopisane recznie przez uzytkownika
 *   3. jego poprawki cen i gramatur
 *
 * Gramatury i ceny sa danymi, nigdy nie sa zaszyte w logice.
 */

export interface Settings {
  people: number;
  /** Ile dni w tygodniu jecie obiad w domu. */
  daysWithDinner: number;
  /** Na ile dni zwykle starcza jedno danie. Zakres 1 do 3. */
  daysPerDish: number;
  excludedTags: DietTag[];
}

export const DEFAULT_SETTINGS: Settings = {
  people: 4,
  daysWithDinner: 5,
  daysPerDish: 1,
  excludedTags: [],
};

/** Produkt dopisany przez uzytkownika. uuid z klienta, user_id nullowalne. */
export interface CustomProduct extends Product {
  userId: string | null;
}

export interface StoredPlan {
  id: string;
  userId: string | null;
  createdAt: string;
  people: number;
  /**
   * Pozycje planu razem ze stanem ugotowania, przypiecia i zapisanym zuzyciem.
   * Kolejnosc odpowiada kolejnosci na ekranie.
   */
  entries: PlanEntry[];
  /** Pozycje odhaczone jako kupione, po id produktu. */
  boughtProductIds: string[];
  /** Pozycje oznaczone jako "mam juz w domu". */
  skippedProductIds: string[];
}

/** Swieza pozycja planu: nieugotowana, nieprzypieta, bez zapisanego zuzycia. */
export function newPlanEntry(
  recipeId: string,
  pinned = false,
  servings = DEFAULT_SETTINGS.people,
  daysCovered = DEFAULT_SETTINGS.daysPerDish,
): PlanEntry {
  return { recipeId, cooked: false, pinned, consumption: null, servings, daysCovered };
}

/**
 * Produkt kupowany co tydzien niezaleznie od planu, glownie na sniadania.
 *
 * `quantity` to liczba OPAKOWAN dla produktow pakowanych, albo ilosc
 * w jednostce produktu dla sprzedawanych luzem.
 */
export interface StandingPurchase {
  id: string;
  userId: string | null;
  productId: string;
  quantity: number;
}

/**
 * Produkt dorzucony recznie do listy zakupow na TEN tydzien.
 *
 * Ta sama arytmetyka co stale zakupy: sumuje sie z zapotrzebowaniem
 * z przepisow przed policzeniem opakowan. Roznica jest taka, ze stale
 * zakupy wracaja co tydzien, a te znikaja przy ukladaniu nowego planu.
 */
export interface ExtraPurchase {
  id: string;
  userId: string | null;
  productId: string;
  quantity: number;
}

/**
 * Zamkniety tydzien. Archiwizowany w chwili wygenerowania nowego planu.
 *
 * `actualLeftover` to wartosc produktow PSUJACYCH SIE, ktore zostaly
 * w spizarni w momencie archiwizacji.
 */
export interface WeekRecord {
  id: string;
  userId: string | null;
  from: string;
  to: string;
  dishes: string[];
  cost: number;
  forecastLeftover: number;
  actualLeftover: number;
}

export interface CatalogOverrides {
  customProducts: CustomProduct[];
  /** id produktu -> cena podana przez uzytkownika. */
  prices: Record<string, number>;
  /** id produktu -> gramatura podana przez uzytkownika. */
  packSizes: Record<string, number>;
}

const EMPTY_OVERRIDES: CatalogOverrides = { customProducts: [], prices: {}, packSizes: {} };

export type StoreErrorCode = 'INVALID_PRODUCT' | 'NOT_CUSTOM_PRODUCT';

export class StoreError extends Error {
  code: StoreErrorCode;
  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

/** Dane nowego produktu. id, userId i walidacja sa po stronie store. */
export type NewProductInput = Omit<Product, 'id'>;

/** Minimalny kontrakt, ktory spelnia AsyncStorage z React Native. */
export interface KeyValueAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface DataStore {
  /** Seed plus wlasne produkty plus poprawki uzytkownika. */
  getCatalog(): Promise<Catalog>;
  getProducts(): Promise<Product[]>;
  getRecipes(): Promise<Recipe[]>;

  getCustomProducts(): Promise<CustomProduct[]>;
  addCustomProduct(input: NewProductInput): Promise<CustomProduct>;
  removeCustomProduct(productId: string): Promise<void>;

  /** Cena jest edytowalnym parametrem, bo sie zmienia. */
  setProductPrice(productId: string, price: number): Promise<void>;
  setProductPackSize(productId: string, packSize: number): Promise<void>;
  resetProductOverrides(productId: string): Promise<void>;

  getPantry(): Promise<PantryItem[]>;
  savePantry(items: PantryItem[]): Promise<void>;

  getStandingPurchases(): Promise<StandingPurchase[]>;
  saveStandingPurchases(items: StandingPurchase[]): Promise<void>;

  getExtraPurchases(): Promise<ExtraPurchase[]>;
  saveExtraPurchases(items: ExtraPurchase[]): Promise<void>;

  getHistory(): Promise<WeekRecord[]>;
  saveHistory(weeks: WeekRecord[]): Promise<void>;

  getPlan(): Promise<StoredPlan | null>;
  savePlan(plan: StoredPlan | null): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

const KEYS = {
  pantry: 'zr.pantry.v1',
  plan: 'zr.plan.v3',
  standing: 'zr.standing.v1',
  extras: 'zr.extras.v1',
  history: 'zr.history.v1',
  settings: 'zr.settings.v2',
  overrides: 'zr.catalog.v1',
} as const;

async function readJson<T>(adapter: KeyValueAdapter, key: string, fallback: T): Promise<T> {
  const raw = await adapter.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Uszkodzony wpis nie moze wywalic aplikacji.
    return fallback;
  }
}

/** Waliduje produkt dopisany recznie. Bledne dane zepsulyby caly plan. */
export function validateProduct(input: NewProductInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new StoreError('INVALID_PRODUCT', 'nazwa produktu nie moze byc pusta');
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new StoreError('INVALID_PRODUCT', 'cena musi byc liczba >= 0');
  }
  if (input.soldAs === 'opakowanie') {
    if (!Number.isFinite(input.packSize ?? NaN) || (input.packSize ?? 0) <= 0) {
      throw new StoreError('INVALID_PRODUCT', 'produkt w opakowaniu musi miec gramature > 0');
    }
  } else if (input.packSize !== null) {
    throw new StoreError('INVALID_PRODUCT', 'produkt na wage nie moze miec gramatury opakowania');
  }
}

/** Naklada poprawki uzytkownika na produkt z seeda. */
function applyOverrides(product: Product, overrides: CatalogOverrides): Product {
  const price = overrides.prices[product.id];
  const packSize = overrides.packSizes[product.id];
  if (price === undefined && packSize === undefined) return product;
  return {
    ...product,
    ...(price !== undefined ? { price } : {}),
    ...(packSize !== undefined && product.soldAs === 'opakowanie' ? { packSize } : {}),
  };
}

export function createLocalStore(adapter: KeyValueAdapter): DataStore {
  const loadOverrides = () => readJson<CatalogOverrides>(adapter, KEYS.overrides, EMPTY_OVERRIDES);
  const saveOverrides = (o: CatalogOverrides) => adapter.setItem(KEYS.overrides, JSON.stringify(o));

  const buildProducts = async (): Promise<Product[]> => {
    const overrides = await loadOverrides();
    const seeded = SEED_PRODUCTS.map((p) => applyOverrides(p, overrides));
    const custom = overrides.customProducts.map((p) => applyOverrides(p, overrides));
    return [...seeded, ...custom];
  };

  const store: DataStore = {
    async getCatalog() {
      return { products: await buildProducts(), recipes: SEED_RECIPES };
    },
    async getProducts() {
      return buildProducts();
    },
    async getRecipes() {
      return SEED_RECIPES;
    },

    async getCustomProducts() {
      return (await loadOverrides()).customProducts;
    },

    async addCustomProduct(input) {
      validateProduct(input);
      const overrides = await loadOverrides();
      const product: CustomProduct = { ...input, id: newId(), userId: null };
      await saveOverrides({ ...overrides, customProducts: [...overrides.customProducts, product] });
      return product;
    },

    async removeCustomProduct(productId) {
      const overrides = await loadOverrides();
      const exists = overrides.customProducts.some((p) => p.id === productId);
      if (!exists) {
        throw new StoreError('NOT_CUSTOM_PRODUCT', `"${productId}" nie jest produktem uzytkownika`);
      }
      await saveOverrides({
        ...overrides,
        customProducts: overrides.customProducts.filter((p) => p.id !== productId),
      });
    },

    async setProductPrice(productId, price) {
      if (!Number.isFinite(price) || price < 0) {
        throw new StoreError('INVALID_PRODUCT', 'cena musi byc liczba >= 0');
      }
      const overrides = await loadOverrides();
      await saveOverrides({ ...overrides, prices: { ...overrides.prices, [productId]: price } });
    },

    async setProductPackSize(productId, packSize) {
      if (!Number.isFinite(packSize) || packSize <= 0) {
        throw new StoreError('INVALID_PRODUCT', 'gramatura musi byc liczba > 0');
      }
      const overrides = await loadOverrides();
      await saveOverrides({
        ...overrides,
        packSizes: { ...overrides.packSizes, [productId]: packSize },
      });
    },

    async resetProductOverrides(productId) {
      const overrides = await loadOverrides();
      const { [productId]: _price, ...prices } = overrides.prices;
      const { [productId]: _size, ...packSizes } = overrides.packSizes;
      await saveOverrides({ ...overrides, prices, packSizes });
    },

    async getPantry() {
      return readJson<PantryItem[]>(adapter, KEYS.pantry, []);
    },
    async savePantry(items) {
      await adapter.setItem(KEYS.pantry, JSON.stringify(items));
    },

    async getStandingPurchases() {
      return readJson<StandingPurchase[]>(adapter, KEYS.standing, []);
    },
    async saveStandingPurchases(items) {
      await adapter.setItem(KEYS.standing, JSON.stringify(items));
    },

    async getExtraPurchases() {
      return readJson<ExtraPurchase[]>(adapter, KEYS.extras, []);
    },
    async saveExtraPurchases(items) {
      await adapter.setItem(KEYS.extras, JSON.stringify(items));
    },

    async getHistory() {
      return readJson<WeekRecord[]>(adapter, KEYS.history, []);
    },
    async saveHistory(weeks) {
      // Trzymamy rozsadny ogon, ekran i tak pokazuje szesc ostatnich.
      await adapter.setItem(KEYS.history, JSON.stringify(weeks.slice(-26)));
    },

    async getPlan() {
      return readJson<StoredPlan | null>(adapter, KEYS.plan, null);
    },
    async savePlan(plan) {
      if (plan === null) {
        await adapter.removeItem(KEYS.plan);
        return;
      }
      await adapter.setItem(KEYS.plan, JSON.stringify(plan));
    },

    async getSettings() {
      return readJson<Settings>(adapter, KEYS.settings, DEFAULT_SETTINGS);
    },
    async saveSettings(settings) {
      await adapter.setItem(KEYS.settings, JSON.stringify(settings));
    },
  };

  return store;
}

/** Adapter w pamieci. Uzywany w testach i w skrypcie demo. */
export function createMemoryAdapter(): KeyValueAdapter {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}
