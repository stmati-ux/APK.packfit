import type {
  Catalog,
  DietTag,
  MealScaling,
  PantryEntry,
  Product,
  Recipe,
  Unit,
} from './types.ts';
import { CATEGORY_ORDER } from './types.ts';
import {
  EPS,
  LOOSE_PRICE_BASE,
  planPurchase,
  roundMoney,
  valueOf,
  wasteValue,
} from './packaging.ts';

/**
 * Modul doboru planu tygodnia. Czysty TypeScript, zero importow z Reacta,
 * zero zapytan sieciowych. Cala optymalizacja liczy sie na urzadzeniu.
 */

export type PlanErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_ENOUGH_RECIPES'
  | 'UNKNOWN_PRODUCT';

export class PlanError extends Error {
  code: PlanErrorCode;
  constructor(code: PlanErrorCode, message: string) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
  }
}

export interface PlanInput {
  people: number;
  /** Ile dni w tygodniu jecie obiad w domu. */
  daysWithDinner: number;
  /** Na ile dni zwykle starcza jedno danie. Zakres 1 do 3. */
  daysPerDish: number;
  /** Twardy filtr. Alergeny nie podlegaja negocjacji. */
  excludedTags: DietTag[];
  pantry: PantryEntry[];
  /**
   * Checkbox "mam juz w domu" z listy zakupow.
   *
   * Rozni sie od spizarni: spizarnia ma konkretna ilosc i moze sie skonczyc,
   * a to jest deklaracja "mam tego pod dostatkiem, nie licz mi tego".
   * Produkt znika z listy zakupow, nie generuje kosztu ani straty
   * i NIE daje bonusu za zuzycie zapasow.
   */
  ownedProductIds?: string[];
  /**
   * Dania przypiete recznie przez uzytkownika.
   *
   * Wchodza do KAZDEJ rozwazanej kombinacji obowiazkowo i nie podlegaja
   * filtrowi wykluczen — skoro uzytkownik sam je dodal, to jego decyzja.
   */
  pinnedRecipeIds?: string[];
  /**
   * Nadpisania dla pojedynczych dan, po id przepisu.
   *
   * Pozwalaja ugotowac jedno danie na wieksza liczbe porcji albo na wiecej dni
   * niz reszta planu. Wplywaja wylacznie na zapotrzebowanie i liste zakupow,
   * nigdy na sklad planu.
   */
  scalingByRecipe?: Record<string, Partial<MealScaling>>;
  /**
   * Wymusza dokladnie tyle dan, zamiast liczyc je z dni.
   *
   * Uzywane wylacznie przy przeliczaniu USTALONEGO zestawu dan, gdy sklad
   * planu ma zostac nietkniety. Zwykle wejscie tego nie ustawia.
   */
  forcedDishCount?: number;
  /**
   * Stale zakupy: rzeczy kupowane co tydzien niezaleznie od planu,
   * glownie na sniadania.
   *
   * Wchodza do sumy zapotrzebowania PRZED policzeniem opakowan, nie po.
   * Dzieki temu mleko na sniadania i mleko do nalesnikow pochodza z tego
   * samego kartonu, a nie z dwoch.
   */
  standingPurchases?: StandingNeed[];
}

/**
 * Pozycja stalych zakupow.
 *
 * `quantity` to liczba OPAKOWAN dla produktow pakowanych,
 * albo ilosc w jednostce produktu dla sprzedawanych luzem.
 */
export interface StandingNeed {
  productId: string;
  quantity: number;
}

/**
 * Ile dan trzeba ugotowac, zeby pokryc tydzien.
 * Zaokraglenie w gore, bo pol dania sie nie ugotuje.
 */
export function dishCount(daysWithDinner: number, daysPerDish: number): number {
  return Math.ceil(daysWithDinner / Math.max(1, daysPerDish));
}

export interface PlanWeights {
  /** Waga kosztu calkowitego w ocenie. Spec: 0.15. */
  costWeight: number;
  /**
   * Waga bonusu za zuzycie zapasow. Spec: 1.5, celowo wyzsza niz waga strat.
   * Cos, co juz lezy otwarte w lodowce, psuje sie TERAZ, wiec zuzycie tego
   * jest pilniejsze niz uniknicie nowej resztki.
   */
  pantryBonusWeight: number;
  /** Kara w PLN za kazde kolejne danie z ta sama kategoria glowna. */
  repeatPenalty: number;
  /**
   * Powyzej tylu kombinacji rezygnujemy z pelnego przegladu i przechodzimy
   * na wyszukiwanie lokalne. Prog dobrany tak, zeby zmiescic sie w 500 ms
   * na telefonie sredniej klasy.
   */
  maxCombinations: number;
}

export const DEFAULT_WEIGHTS: PlanWeights = {
  costWeight: 0.15,
  pantryBonusWeight: 1.5,
  repeatPenalty: 1.5,
  maxCombinations: 300_000,
};

export interface ShoppingListItem {
  product: Product;
  /** 0 dla produktow sprzedawanych luzem. */
  packCount: number;
  packSize: number | null;
  unit: Unit;
  /** Ile lacznie potrzebuja dania z planu, przed odjeciem spizarni. */
  needed: number;
  fromPantry: number;
  /** Ile zostanie po ugotowaniu wszystkiego z planu. */
  leftover: number;
  itemCost: number;
}

export interface PlanResult {
  meals: Recipe[];
  shoppingList: ShoppingListItem[];
  totalCost: number;
  /** Wartosc resztek, ktore sie zmarnuja (tylko produkty psujace sie). */
  leftoverValue: number;
  /** Punkt odniesienia: srednia strat dla wszystkich sprawdzonych kombinacji. */
  averagePlanLeftoverValue: number;
  /** Realna korzysc z optymalizacji. Musi byc pokazana uzytkownikowi. */
  savings: number;
  /** Dania przypiete, zawsze na poczatku `meals`. */
  pinned: Recipe[];
  /**
   * Faktyczna liczba dan w planie. Bywa wieksza niz wynika z rachunku,
   * gdy przypietych jest wiecej.
   */
  dishCount: number;
  /** Ile dni lacznie pokrywa plan, po zsumowaniu naIleDni wszystkich dan. */
  daysCovered: number;
  combinationsChecked: number;
  /** true, gdy zamiast pelnego przegladu zadzialalo wyszukiwanie lokalne. */
  sampled: boolean;
}

/**
 * Ilosc skladnika przeskalowana na liczbe porcji i liczbe dni.
 *
 *   ilosc * (porcje / porcje_bazowe) * dniNaDanie
 */
export function scaleAmount(
  amount: number,
  servings: number,
  baseServings: number,
  daysCovered = 1,
): number {
  return amount * (servings / baseServings) * daysCovered;
}

/** Liczba kombinacji bez powtorzen. Zwraca Infinity przy przepelnieniu. */
export function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
    if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) return Infinity;
  }
  return Math.round(result);
}

/** Deterministyczny generator, zeby ten sam plan dawal ten sam wynik. */
function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function createPlan(
  input: PlanInput,
  catalog: Catalog,
  weights: PlanWeights = DEFAULT_WEIGHTS,
): PlanResult {
  const { people, daysWithDinner, daysPerDish } = input;

  if (!Number.isFinite(people) || people < 1) {
    throw new PlanError('INVALID_INPUT', `people must be >= 1, got ${people}`);
  }
  if (!Number.isInteger(daysWithDinner) || daysWithDinner < 1) {
    throw new PlanError(
      'INVALID_INPUT',
      `daysWithDinner must be an integer >= 1, got ${daysWithDinner}`,
    );
  }
  if (!Number.isInteger(daysPerDish) || daysPerDish < 1) {
    throw new PlanError('INVALID_INPUT', `daysPerDish must be an integer >= 1, got ${daysPerDish}`);
  }

  const mealCount = input.forcedDishCount ?? dishCount(daysWithDinner, daysPerDish);

  /** Skalowanie dla konkretnego przepisu, z uwzglednieniem nadpisan. */
  const scalingFor = (recipeId: string): MealScaling => {
    const override = input.scalingByRecipe?.[recipeId];
    return {
      servings: override?.servings ?? people,
      daysCovered: override?.daysCovered ?? daysPerDish,
    };
  };

  // --- dania przypiete: wchodza do planu bezwarunkowo ----------------------
  const pinnedIds = new Set(input.pinnedRecipeIds ?? []);
  const pinnedRecipes = catalog.recipes.filter((r) => pinnedIds.has(r.id));

  // Gdy przypietych jest wiecej niz zaplanowano posilkow, plan sie rozszerza.
  const effectiveMealCount = Math.max(mealCount, pinnedRecipes.length);

  // --- krok 1: twardy filtr wykluczen (tylko dla puli do dobrania) ---------
  const excluded = new Set(input.excludedTags);
  const available = catalog.recipes.filter(
    (r) => !pinnedIds.has(r.id) && !r.tags.some((t) => excluded.has(t)),
  );

  const toPick = effectiveMealCount - pinnedRecipes.length;

  if (available.length < toPick) {
    throw new PlanError(
      'NOT_ENOUGH_RECIPES',
      `need ${toPick} more recipes, only ${available.length} left after exclusions`,
    );
  }

  // --- indeks produktow uzywanych przez dostepne przepisy ------------------
  const productById = new Map(catalog.products.map((p) => [p.id, p]));
  const indexOf = new Map<string, number>();
  const products: Product[] = [];

  const register = (productId: string): number => {
    const existing = indexOf.get(productId);
    if (existing !== undefined) return existing;
    const product = productById.get(productId);
    if (!product) {
      throw new PlanError('UNKNOWN_PRODUCT', `recipe references unknown product "${productId}"`);
    }
    const idx = products.length;
    products.push(product);
    indexOf.set(productId, idx);
    return idx;
  };

  // --- krok 2: przeskalowanie skladnikow na liczbe osob --------------------
  const ingredientIdx: Int32Array[] = [];
  const ingredientAmt: Float64Array[] = [];

  // Indeksy 0..available.length-1 to pula do dobrania, dalsze to dania przypiete.
  const allRecipes = [...available, ...pinnedRecipes];

  for (const recipe of allRecipes) {
    const idxs = new Int32Array(recipe.ingredients.length);
    const amts = new Float64Array(recipe.ingredients.length);
    const scaling = scalingFor(recipe.id);
    recipe.ingredients.forEach((ing, i) => {
      idxs[i] = register(ing.productId);
      amts[i] = scaleAmount(ing.amount, scaling.servings, recipe.baseServings, scaling.daysCovered);
    });
    ingredientIdx.push(idxs);
    ingredientAmt.push(amts);
  }

  // Stale zakupy moga dotyczyc produktow, ktorych zaden przepis nie uzywa,
  // wiec trzeba je dorejestrowac zanim policzymy rozmiar tablic.
  for (const entry of input.standingPurchases ?? []) {
    if (entry.quantity > 0) register(entry.productId);
  }

  const P = products.length;

  // Tablice typowane zamiast obiektow: petla oceny wykonuje sie setki tysiecy razy.
  const packSize = new Float64Array(P);
  const price = new Float64Array(P);
  const isLoose = new Uint8Array(P);
  const perishable = new Uint8Array(P);
  const pantryAmount = new Float64Array(P);

  products.forEach((p, i) => {
    packSize[i] = p.packSize ?? 1;
    price[i] = p.price;
    isLoose[i] = p.soldAs === 'luz' ? 1 : 0;
    perishable[i] = p.perishable ? 1 : 0;
  });

  // Zapasy produktow, ktorych zaden dostepny przepis nie uzywa, sa nieistotne:
  // ten plan i tak ich nie zuzyje.
  for (const entry of input.pantry) {
    const idx = indexOf.get(entry.productId);
    if (idx !== undefined && entry.amount > 0) {
      pantryAmount[idx] = (pantryAmount[idx] ?? 0) + entry.amount;
    }
  }

  /**
   * Stale zapotrzebowanie, doliczane do KAZDEJ kombinacji tak samo.
   * Trzymane osobno od akumulatora, zeby nie trzeba go bylo zerowac
   * przy kazdym cofnieciu kroku wyszukiwania.
   */
  const standingNeed = new Float64Array(P);
  for (const entry of input.standingPurchases ?? []) {
    const idx = indexOf.get(entry.productId);
    if (idx === undefined || entry.quantity <= 0) continue;
    const product = products[idx]!;
    const amount =
      product.soldAs === 'luz' ? entry.quantity : entry.quantity * (product.packSize ?? 1);
    standingNeed[idx] = (standingNeed[idx] ?? 0) + amount;
  }

  // "Mam juz w domu": produkt wypada z rachunku w calosci.
  const owned = new Uint8Array(P);
  for (const productId of input.ownedProductIds ?? []) {
    const idx = indexOf.get(productId);
    if (idx !== undefined) owned[idx] = 1;
  }

  // --- kategorie glowne do kary za powtorzenia -----------------------------
  const mainCategories: string[] = [];
  const mainIndex = new Int32Array(allRecipes.length);
  allRecipes.forEach((recipe, i) => {
    let idx = mainCategories.indexOf(recipe.mainCategory);
    if (idx === -1) {
      idx = mainCategories.length;
      mainCategories.push(recipe.mainCategory);
    }
    mainIndex[i] = idx;
  });

  /** Wartosc ilosci produktu, wersja na tablicach typowanych. */
  const unitValue = (i: number, amount: number): number =>
    isLoose[i] === 1
      ? (amount / LOOSE_PRICE_BASE) * price[i]!
      : (amount / packSize[i]!) * price[i]!;

  /**
   * Kroki 4-6: zsumowane zapotrzebowanie -> zakupy, straty, bonus za zapasy.
   * Strata liczona WYLACZNIE dla produktow psujacych sie.
   */
  const evaluate = (acc: Float64Array) => {
    let cost = 0;
    let waste = 0;
    let bonus = 0;

    for (let i = 0; i < P; i++) {
      // Suma zapotrzebowania z przepisow i ze stalych zakupow. Dopiero
      // od tej sumy liczymy opakowania, nigdy od kazdej czesci osobno.
      const required = acc[i]! + standingNeed[i]!;
      if (required <= EPS) continue;
      // Uzytkownik zadeklarowal, ze to ma. Zero kosztu, zero straty, zero bonusu.
      if (owned[i] === 1) continue;

      const have = pantryAmount[i]!;
      const used = have < required ? have : required;
      const missing = required - used;

      if (perishable[i] === 1 && used > EPS) {
        bonus += unitValue(i, used);
      }

      if (missing <= EPS) continue;

      if (isLoose[i] === 1) {
        cost += (missing / LOOSE_PRICE_BASE) * price[i]!;
        continue;
      }

      const size = packSize[i]!;
      const packs = Math.ceil(missing / size - EPS);
      cost += packs * price[i]!;

      if (perishable[i] === 1) {
        waste += ((packs * size - missing) / size) * price[i]!;
      }
    }

    return { cost, waste, bonus };
  };

  const n = available.length;
  const acc = new Float64Array(P);
  const mainCount = new Int32Array(mainCategories.length);

  const applyRecipe = (r: number, sign: number): void => {
    const idxs = ingredientIdx[r]!;
    const amts = ingredientAmt[r]!;
    for (let k = 0; k < idxs.length; k++) {
      const target = idxs[k]!;
      acc[target] = acc[target]! + sign * amts[k]!;
    }
  };

  /**
   * Dania przypiete siedza w akumulatorze przez caly przeglad, wiec kazda
   * rozwazana kombinacja zawiera je z automatu. Zwraca ich wklad do kary
   * za powtorzenia.
   */
  const seedPinned = (): number => {
    let penalty = 0;
    for (let i = available.length; i < allRecipes.length; i++) {
      applyRecipe(i, 1);
      const m = mainIndex[i]!;
      const before = mainCount[m]!;
      penalty += before === 0 ? 0 : (2 * before - 1) * weights.repeatPenalty;
      mainCount[m] = before + 1;
    }
    return penalty;
  };

  let bestScore = Infinity;
  let bestCombo: number[] = [];
  let wasteSum = 0;
  let checked = 0;

  /**
   * Krok 7: ocena kombinacji, im nizej tym lepiej.
   *
   * `countToBaseline` decyduje, czy ta ocena wchodzi do sredniej sluzacej
   * za punkt odniesienia. Przy wyszukiwaniu lokalnym MUSI byc false, bo
   * wspinaczka odwiedza glownie dobre kombinacje i srednia z nich zanizylaby
   * punkt odniesienia, a wiec i pokazana uzytkownikowi oszczednosc.
   */
  const score = (penalty: number, countToBaseline = true): number => {
    const { cost, waste, bonus } = evaluate(acc);
    if (countToBaseline) {
      wasteSum += waste;
      checked++;
    }
    return waste + weights.costWeight * cost + penalty - weights.pantryBonusWeight * bonus;
  };

  const total = combinationCount(n, toPick);
  const sampled = total > weights.maxCombinations;

  if (!sampled) {
    // --- krok 3: pelny przeglad kombinacji --------------------------------
    const combo: number[] = [];
    const basePenalty = seedPinned();

    const walk = (start: number, depth: number, penalty: number): void => {
      if (depth === toPick) {
        const value = score(penalty);
        if (value < bestScore) {
          bestScore = value;
          bestCombo = combo.slice();
        }
        return;
      }
      const remaining = toPick - depth;
      for (let i = start; i <= n - remaining; i++) {
        applyRecipe(i, 1);
        const m = mainIndex[i]!;
        const before = mainCount[m]!;
        // kara rosnie kwadratowo: 2 dania tej samej kategorii = 1x, 3 = 4x, 4 = 9x
        const delta = before === 0 ? 0 : (2 * before - 1) * weights.repeatPenalty;
        mainCount[m] = before + 1;
        combo.push(i);

        walk(i + 1, depth + 1, penalty + delta);

        combo.pop();
        mainCount[m] = before;
        applyRecipe(i, -1);
      }
    };

    walk(0, 0, basePenalty);
  } else {
    /**
     * Za duzo kombinacji na pelny przeglad, wiec wyszukiwanie lokalne
     * z restartami zamiast losowego probkowania.
     *
     * Przy 86 przepisach i 5 daniach kombinacji jest prawie 35 milionow.
     * Losowe probkowanie dwoch milionow z nich trwalo 3,3 sekundy i i tak
     * trafialo slabo, bo dwa miliony to niecale 6 procent przestrzeni.
     * Wspinaczka po sasiadach znajduje rownie dobry albo lepszy plan
     * przy kilkunastu tysiacach ocen.
     *
     * Generator ma stale ziarno, wiec wynik jest powtarzalny.
     */
    const rng = createRng(n * 1000003 + toPick * 7919 + Math.round(people) * 104729);

    /** Liczy ocene dla podanego zestawu, zostawiajac akumulator wyczyszczony. */
    const scoreCombo = (combo: number[]): number => {
      acc.fill(0);
      mainCount.fill(0);
      let penalty = seedPinned();
      for (const r of combo) {
        applyRecipe(r, 1);
        const m = mainIndex[r]!;
        const before = mainCount[m]!;
        penalty += before === 0 ? 0 : (2 * before - 1) * weights.repeatPenalty;
        mainCount[m] = before + 1;
      }
      const value = score(penalty, false);
      acc.fill(0);
      return value;
    };

    const randomCombo = (): number[] => {
      const pool = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < toPick; i++) {
        const j = i + Math.floor(rng() * (n - i));
        const tmp = pool[i]!;
        pool[i] = pool[j]!;
        pool[j] = tmp;
      }
      return pool.slice(0, toPick).sort((a, b) => a - b);
    };

    const RESTARTS = 8;
    const MAX_PASSES = 12;

    for (let restart = 0; restart < RESTARTS; restart++) {
      let combo = randomCombo();
      let comboScore = scoreCombo(combo);

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let improvedAt = -1;
        let improvedWith = -1;
        let improvedScore = comboScore;
        const inCombo = new Set(combo);

        // Sasiedztwo: podmiana jednego dania na dowolne spoza zestawu.
        for (let slot = 0; slot < combo.length; slot++) {
          for (let candidate = 0; candidate < n; candidate++) {
            if (inCombo.has(candidate)) continue;
            const trial = combo.slice();
            trial[slot] = candidate;
            const value = scoreCombo(trial);
            if (value < improvedScore - 1e-9) {
              improvedScore = value;
              improvedAt = slot;
              improvedWith = candidate;
            }
          }
        }

        if (improvedAt === -1) break;
        combo = combo.slice();
        combo[improvedAt] = improvedWith;
        combo.sort((a, b) => a - b);
        comboScore = improvedScore;
      }

      if (comboScore < bestScore) {
        bestScore = comboScore;
        bestCombo = combo.slice();
      }
    }

    /**
     * Punkt odniesienia liczymy osobno, na kombinacjach losowanych
     * rownomiernie. Inaczej "ile zostaloby przy zakupach na oko" bylaby
     * liczba wziete z planow, ktore optymalizator juz wybral jako dobre.
     */
    const BASELINE_SAMPLES = 400;
    for (let i = 0; i < BASELINE_SAMPLES; i++) {
      const combo = randomCombo();
      acc.fill(0);
      mainCount.fill(0);
      let penalty = seedPinned();
      for (const r of combo) {
        applyRecipe(r, 1);
        const m = mainIndex[r]!;
        const before = mainCount[m]!;
        penalty += before === 0 ? 0 : (2 * before - 1) * weights.repeatPenalty;
        mainCount[m] = before + 1;
      }
      score(penalty, true);
    }

    acc.fill(0);
    mainCount.fill(0);
  }

  // --- krok 8: lista zakupow dla zwyciezcy ---------------------------------
  acc.fill(0);
  for (let i = available.length; i < allRecipes.length; i++) applyRecipe(i, 1);
  for (const r of bestCombo) applyRecipe(r, 1);

  const shoppingList: ShoppingListItem[] = [];
  let totalCost = 0;
  let leftoverValue = 0;

  for (let i = 0; i < P; i++) {
    const required = acc[i]! + standingNeed[i]!;
    if (required <= EPS) continue;
    // "Mam juz w domu" znika z listy zakupow.
    if (owned[i] === 1) continue;

    const product = products[i]!;
    const purchase = planPurchase(product, required, pantryAmount[i]!);

    leftoverValue += wasteValue(product, purchase.leftover);

    // Produkt w pelni pokryty ze spizarni nie trafia na liste zakupow.
    if (purchase.packCount === 0 && purchase.bought <= EPS) continue;

    totalCost += purchase.cost;
    shoppingList.push({
      product,
      packCount: purchase.packCount,
      packSize: product.packSize,
      unit: product.unit,
      needed: Math.round(required * 1000) / 1000,
      fromPantry: purchase.fromPantry,
      leftover: purchase.leftover,
      itemCost: roundMoney(purchase.cost),
    });
  }

  // Kolejnosc obchodzenia sklepu, w obrebie kategorii alfabetycznie.
  shoppingList.sort((a, b) => {
    const byCategory =
      CATEGORY_ORDER.indexOf(a.product.category) - CATEGORY_ORDER.indexOf(b.product.category);
    return byCategory !== 0 ? byCategory : a.product.name.localeCompare(b.product.name, 'pl');
  });

  // Oszczednosc liczymy z wartosci JUZ zaokraglonych, zeby liczby na ekranie
  // sie zgadzaly. Inaczej 26,90 minus 1,86 pokazywaloby 25,05 zamiast 25,04.
  const chosenMeals = [...pinnedRecipes, ...bestCombo.map((i) => available[i]!)];

  const averageLeftover = roundMoney(checked > 0 ? wasteSum / checked : 0);
  const roundedLeftover = roundMoney(leftoverValue);

  return {
    meals: chosenMeals,
    pinned: pinnedRecipes,
    dishCount: effectiveMealCount,
    daysCovered: chosenMeals.reduce((sum, r) => sum + scalingFor(r.id).daysCovered, 0),
    shoppingList,
    totalCost: roundMoney(totalCost),
    leftoverValue: roundedLeftover,
    averagePlanLeftoverValue: averageLeftover,
    savings: roundMoney(averageLeftover - roundedLeftover),
    combinationsChecked: checked,
    sampled,
  };
}

/**
 * Przelicza koszty i resztki dla Z GORY USTALONEGO zestawu dan.
 *
 * Potrzebne wtedy, gdy plan ma zostac ten sam, a zmienilo sie cos wokol:
 * uzytkownik zaznaczyl "mam juz w domu", odhaczyl zakup albo poprawil cene.
 * Pelne generowanie od nowa przemeblowaloby menu w srodku sklepu.
 *
 * @param baselineLeftoverValue punkt odniesienia z pierwotnego planu.
 *   Bez niego oszczednosc wyszlaby zero, bo przy ustalonym zestawie dan
 *   istnieje dokladnie jedna kombinacja i srednia rowna sie wynikowi.
 */
export function planForMeals(
  input: PlanInput,
  catalog: Catalog,
  recipeIds: string[],
  weights: PlanWeights = DEFAULT_WEIGHTS,
  baselineLeftoverValue?: number,
): PlanResult {
  const chosen = catalog.recipes.filter((r) => recipeIds.includes(r.id));
  if (chosen.length === 0) {
    throw new PlanError('INVALID_INPUT', 'planForMeals needs at least one known recipe');
  }

  const result = createPlan(
    { ...input, forcedDishCount: chosen.length, excludedTags: [] },
    { products: catalog.products, recipes: chosen },
    weights,
  );

  if (baselineLeftoverValue === undefined) return result;

  const baseline = roundMoney(baselineLeftoverValue);
  return {
    ...result,
    averagePlanLeftoverValue: baseline,
    savings: roundMoney(baseline - result.leftoverValue),
  };
}

/**
 * Podmiana jednego dania w gotowym planie, z przeliczeniem calosci.
 * Obsluguje przycisk "Wymien" na ekranie planu.
 */
export function swapMeal(
  input: PlanInput,
  catalog: Catalog,
  currentMealIds: string[],
  replaceRecipeId: string,
  weights: PlanWeights = DEFAULT_WEIGHTS,
  baselineLeftoverValue?: number,
): PlanResult {
  const kept = currentMealIds.filter((id) => id !== replaceRecipeId);
  if (kept.length === currentMealIds.length) {
    throw new PlanError('INVALID_INPUT', `recipe "${replaceRecipeId}" is not in the current plan`);
  }

  // Dania przypietego nie wymieniamy. Najpierw trzeba je odpiac.
  if ((input.pinnedRecipeIds ?? []).includes(replaceRecipeId)) {
    throw new PlanError('INVALID_INPUT', `recipe "${replaceRecipeId}" is pinned, unpin it first`);
  }

  const keptSet = new Set(kept);

  // Szukamy tylko jednego zastepstwa, reszta planu zostaje nietknieta.
  // Wykluczenia dietetyczne obowiazuja dalej, wiec ida do createPlan.
  // pinnedRecipeIds celowo puste: tu dobieramy jedno wolne miejsce.
  const replacement = createPlan(
    { ...input, forcedDishCount: 1, pinnedRecipeIds: [] },
    {
      products: catalog.products,
      recipes: catalog.recipes.filter((r) => !keptSet.has(r.id) && r.id !== replaceRecipeId),
    },
    weights,
  );

  // Kolejnosc dan z ekranu musi zostac, tylko podmieniona pozycja sie zmienia.
  const newId = replacement.meals[0]!.id;
  const mealIds = currentMealIds.map((id) => (id === replaceRecipeId ? newId : id));

  const recomputed = planForMeals(input, catalog, mealIds, weights, baselineLeftoverValue);
  const byId = new Map(recomputed.meals.map((r) => [r.id, r]));

  return { ...recomputed, meals: mealIds.map((id) => byId.get(id)!) };
}
