import type { PantryEntry, Product, Recipe, Unit } from './types.ts';
import { EPS, roundAmount } from './packaging.ts';
import { scaleAmount } from './optimizer.ts';

/**
 * Wykonalnosc przepisu wzgledem stanu spizarni.
 *
 * Progi tolerancji sa STALYMI w tym jednym module. Nie rozsypuj ich po kodzie
 * ani po komponentach.
 */

/** Niedobor do tego udzialu zapotrzebowania jest tolerowany. */
export const SHORTFALL_TOLERANCE_RATIO = 0.15;

/** Niedobor do tylu gramow lub mililitrow jest tolerowany niezaleznie od udzialu. */
export const SHORTFALL_TOLERANCE_ABSOLUTE = 5;

/**
 * Kategoria zawsze tolerowana.
 *
 * Brak trzech gramow papryki w proszku nie blokuje ugotowania obiadu
 * i nie ma sensu, zeby aplikacja sie tym przejmowala.
 */
export const ALWAYS_TOLERATED_CATEGORY = 'przyprawy';

/** Jednostki, dla ktorych dziala prog kwotowy. Sztuk nie da sie polowic. */
const WEIGHT_UNITS: readonly Unit[] = ['g', 'ml'];

export type IngredientAvailability = 'masz' | 'prawie' | 'brak';

export type RecipeFeasibility = 'zrobisz' | 'zrobisz_prawie' | 'nie_zrobisz';

export interface IngredientCheck {
  product: Product;
  /** Zapotrzebowanie przeskalowane na liczbe osob. */
  needed: number;
  inPantry: number;
  shortfall: number;
  status: IngredientAvailability;
}

export interface RecipeCheck {
  status: RecipeFeasibility;
  ingredients: IngredientCheck[];
}

/** Czy niedobor tego skladnika mozna zignorowac. */
export function isShortfallTolerated(
  product: Product,
  needed: number,
  shortfall: number,
): boolean {
  if (shortfall <= EPS) return true;
  if (product.category === ALWAYS_TOLERATED_CATEGORY) return true;
  if (WEIGHT_UNITS.includes(product.unit) && shortfall <= SHORTFALL_TOLERANCE_ABSOLUTE) return true;
  if (needed > EPS && shortfall / needed <= SHORTFALL_TOLERANCE_RATIO) return true;
  return false;
}

export function ingredientAvailability(
  product: Product,
  needed: number,
  inPantry: number,
): IngredientAvailability {
  const shortfall = Math.max(0, needed - inPantry);
  if (shortfall <= EPS) return 'masz';
  return isShortfallTolerated(product, needed, shortfall) ? 'prawie' : 'brak';
}

/**
 * Sprawdza caly przepis. Zwraca status kazdego skladnika i status dania.
 *
 * `zrobisz`        wszystkie skladniki na stanie
 * `zrobisz_prawie` zaden skladnik nie brakuje na powaznie, przynajmniej jeden ledwo
 * `nie_zrobisz`    przynajmniej jednego skladnika brakuje na powaznie
 */
export function checkRecipe(
  recipe: Recipe,
  servings: number,
  pantry: PantryEntry[],
  products: Product[],
  daysCovered = 1,
): RecipeCheck {
  const productById = new Map(products.map((p) => [p.id, p]));

  const totals = new Map<string, number>();
  for (const entry of pantry) {
    totals.set(entry.productId, (totals.get(entry.productId) ?? 0) + entry.amount);
  }

  const ingredients: IngredientCheck[] = [];
  let anyMissing = false;
  let anyAlmost = false;

  for (const ingredient of recipe.ingredients) {
    const product = productById.get(ingredient.productId);
    if (!product) continue;

    const needed = scaleAmount(ingredient.amount, servings, recipe.baseServings, daysCovered);
    const inPantry = totals.get(product.id) ?? 0;
    const shortfall = Math.max(0, needed - inPantry);
    const status = ingredientAvailability(product, needed, inPantry);

    if (status === 'brak') anyMissing = true;
    if (status === 'prawie') anyAlmost = true;

    ingredients.push({
      product,
      needed: roundAmount(needed),
      inPantry: roundAmount(Math.min(inPantry, needed)),
      shortfall: roundAmount(shortfall),
      status,
    });
  }

  const status: RecipeFeasibility = anyMissing
    ? 'nie_zrobisz'
    : anyAlmost
      ? 'zrobisz_prawie'
      : 'zrobisz';

  return { status, ingredients };
}

/** Czy przepis przechodzi filtr "moge zrobic z tego, co mam". */
export function isCookableNow(status: RecipeFeasibility): boolean {
  return status === 'zrobisz' || status === 'zrobisz_prawie';
}
