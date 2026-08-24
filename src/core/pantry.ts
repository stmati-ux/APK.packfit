import type { ConsumptionLine, PantryItem, Product, Recipe } from './types.ts';
import { EPS, roundAmount, valueOf } from './packaging.ts';
import { scaleAmount } from './optimizer.ts';

/**
 * Spizarnia. Zasada nadrzedna: uzytkownik nigdy nie wpisuje niczego recznie,
 * jesli da sie tego uniknac. Reczne prowadzenie stanu lodowki zabilo kazda
 * aplikacje tego typu.
 */

export interface ConsumedLine {
  productId: string;
  /** Ile faktycznie zdjeto ze spizarni. */
  amount: number;
}

export interface ShortfallLine {
  productId: string;
  /** Ilu brakowalo. Aplikacja informuje, ale nie blokuje. */
  amount: number;
}

export interface CookResult {
  pantry: PantryItem[];
  consumed: ConsumedLine[];
  shortfalls: ShortfallLine[];
}

/**
 * Przycisk "Ugotowane". Zdejmuje ze spizarni wszystkie skladniki dania,
 * przeskalowane na liczbe osob.
 *
 * Gdy czegos brakuje, schodzi do zera i NIGDY do wartosci ujemnych.
 * Dziala zawsze, niezaleznie od brakow.
 */
export function cookRecipe(
  pantry: PantryItem[],
  recipe: Recipe,
  servings: number,
  daysCovered = 1,
): CookResult {
  // Najstarsze partie schodza pierwsze.
  const remaining = [...pantry].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const consumed: ConsumedLine[] = [];
  const shortfalls: ShortfallLine[] = [];

  for (const ingredient of recipe.ingredients) {
    let needed = scaleAmount(ingredient.amount, servings, recipe.baseServings, daysCovered);
    let taken = 0;

    for (const item of remaining) {
      if (needed <= EPS) break;
      if (item.productId !== ingredient.productId || item.amount <= EPS) continue;

      const take = Math.min(item.amount, needed);
      item.amount = roundAmount(item.amount - take);
      needed = roundAmount(needed - take);
      taken += take;
    }

    if (taken > EPS) {
      consumed.push({ productId: ingredient.productId, amount: roundAmount(taken) });
    }
    if (needed > EPS) {
      shortfalls.push({ productId: ingredient.productId, amount: roundAmount(needed) });
    }
  }

  return {
    // Pozycje wyzerowane znikaja ze spizarni.
    pantry: remaining.filter((item) => item.amount > EPS),
    consumed,
    shortfalls,
  };
}

/**
 * Odhaczenie pozycji jako kupionej.
 *
 * Do spizarni trafia PELNE opakowanie, nie ilosc potrzebna do przepisu.
 * Kupil 400 g smietany, wiec ma 400 g.
 */
export function addPurchaseToPantry(
  pantry: PantryItem[],
  product: Product,
  packCount: number,
  now: string,
  newId: () => string,
): PantryItem[] {
  const amount =
    product.soldAs === 'luz' ? packCount : packCount * (product.packSize ?? 1);
  if (amount <= EPS) return pantry;

  return [
    ...pantry,
    {
      id: newId(),
      userId: null,
      productId: product.id,
      amount: roundAmount(amount),
      addedAt: now,
      source: 'zakupy',
    },
  ];
}

/** Reczne dodanie. Sciezka poboczna, schowana pod przyciskiem. */
export function addManualToPantry(
  pantry: PantryItem[],
  productId: string,
  amount: number,
  now: string,
  newId: () => string,
): PantryItem[] {
  if (amount <= EPS) return pantry;
  return [
    ...pantry,
    { id: newId(), userId: null, productId, amount: roundAmount(amount), addedAt: now, source: 'reczne' },
  ];
}

/** Reczna korekta ilosci. Stan zawsze w koncu sie rozjedzie. */
export function adjustPantryItem(
  pantry: PantryItem[],
  itemId: string,
  amount: number,
): PantryItem[] {
  return pantry
    .map((item) => (item.id === itemId ? { ...item, amount: roundAmount(Math.max(0, amount)) } : item))
    .filter((item) => item.amount > EPS);
}

export function removePantryItem(pantry: PantryItem[], itemId: string): PantryItem[] {
  return pantry.filter((item) => item.id !== itemId);
}

/** Sumaryczny stan per produkt, w formacie ktorego oczekuje optymalizator. */
export function pantryTotals(pantry: PantryItem[]): { productId: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const item of pantry) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.amount);
  }
  return [...totals].map(([productId, amount]) => ({ productId, amount: roundAmount(amount) }));
}

/**
 * Wartosc tego, co zostalo w spizarni i sie zmarnuje.
 *
 * Liczona WYLACZNIE z produktow psujacych sie. Ryz i makaron zostaja
 * na kolejny tydzien, wiec nie sa strata.
 */
export function perishableValue(pantry: PantryItem[], products: Product[]): number {
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  for (const item of pantry) {
    const product = byId.get(item.productId);
    if (!product || !product.perishable) continue;
    total += valueOf(product, item.amount);
  }
  return Math.round(total * 100) / 100;
}

export type IngredientStatus =
  | { kind: 'have' }
  | { kind: 'partial'; missing: number }
  | { kind: 'none' };

/**
 * Status skladnika na ekranie przepisu: "Masz", "Brakuje 50 g", "Nie masz".
 */
export function ingredientStatus(
  pantry: PantryItem[],
  productId: string,
  required: number,
): IngredientStatus {
  const have = pantry
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.amount, 0);

  if (have <= EPS) return { kind: 'none' };
  if (have + EPS >= required) return { kind: 'have' };
  return { kind: 'partial', missing: roundAmount(required - have) };
}

// ---------------------------------------------------------------------------
// Ugotowane, cofniecie i korekta zuzycia
//
// ZASADA: to, co ma wrocic do spizarni, bierze sie WYLACZNIE z zapisanego
// zuzycia pozycji planu. Nigdy nie wyliczaj tego ponownie z przepisu, bo
// uzytkownik mogl te ilosci wczesniej poprawic.
// ---------------------------------------------------------------------------

export interface CookedResult {
  pantry: PantryItem[];
  /** Ile FAKTYCZNIE zeszlo, po jednej pozycji na kazdy skladnik, takze zera. */
  consumption: ConsumptionLine[];
  shortfalls: ShortfallLine[];
}

/**
 * Oznaczenie dania jako ugotowanego.
 *
 * Zwraca pelna liste zuzycia, rowniez dla skladnikow, ktorych w spizarni
 * nie bylo wcale. Panel korekty musi pokazac wszystkie skladniki, a nie
 * tylko te, ktore udalo sie odjac.
 */
export function markCooked(
  pantry: PantryItem[],
  recipe: Recipe,
  servings: number,
  daysCovered = 1,
): CookedResult {
  const result = cookRecipe(pantry, recipe, servings, daysCovered);
  const taken = new Map(result.consumed.map((c) => [c.productId, c.amount]));

  const consumption: ConsumptionLine[] = recipe.ingredients.map((ingredient) => ({
    productId: ingredient.productId,
    amount: taken.get(ingredient.productId) ?? 0,
  }));

  return { pantry: result.pantry, consumption, shortfalls: result.shortfalls };
}

/**
 * Dokłada ilosc do spizarni, doklejajac do istniejacej pozycji tego produktu,
 * zeby cofniecie nie mnozylo wpisow.
 */
function giveBack(
  pantry: PantryItem[],
  productId: string,
  amount: number,
  now: string,
  newId: () => string,
): PantryItem[] {
  if (amount <= EPS) return pantry;

  const index = pantry.findIndex((item) => item.productId === productId);
  if (index !== -1) {
    const existing = pantry[index]!;
    const next = [...pantry];
    next[index] = { ...existing, amount: roundAmount(existing.amount + amount) };
    return next;
  }

  return [
    ...pantry,
    { id: newId(), userId: null, productId, amount: roundAmount(amount), addedAt: now, source: 'reczne' },
  ];
}

/** Odznaczenie dania. Zwraca do spizarni DOKLADNIE to, co zostalo odjete. */
export function undoCooked(
  pantry: PantryItem[],
  consumption: ConsumptionLine[],
  now: string,
  newId: () => string,
): PantryItem[] {
  let next = pantry;
  for (const line of consumption) {
    next = giveBack(next, line.productId, line.amount, now, newId);
  }
  return next;
}

export interface CorrectionResult {
  pantry: PantryItem[];
  /** Zuzycie po korekcie. Zastepuje poprzednie w pozycji planu. */
  consumption: ConsumptionLine[];
}

/**
 * Korekta zuzycia. Spizarnia zmienia sie o ROZNICE miedzy stara a nowa
 * wartoscia, nie o pelna wartosc.
 *
 * Wartosci nie moga byc ujemne. Moga byc wieksze niz wynika z przepisu, bo
 * uzytkownik mogl dolozyc wiecej, i moga byc zerowe, jesli czegos nie uzyl.
 *
 * Gdy w spizarni nie ma tyle, ile uzytkownik deklaruje, schodzimy do zera
 * i zapisujemy ilosc FAKTYCZNIE zdjeta, zeby cofniecie pozostalo dokladne.
 */
export function correctConsumption(
  pantry: PantryItem[],
  previous: ConsumptionLine[],
  corrected: ConsumptionLine[],
  now: string,
  newId: () => string,
): CorrectionResult {
  const before = new Map(previous.map((line) => [line.productId, line.amount]));
  let next = pantry;
  const consumption: ConsumptionLine[] = [];

  for (const line of corrected) {
    const wanted = Math.max(0, line.amount);
    const had = before.get(line.productId) ?? 0;
    const delta = roundAmount(wanted - had);

    if (delta > EPS) {
      // Uzytkownik zuzyl wiecej. Dobieramy roznice ze spizarni.
      let toTake = delta;
      let actuallyTaken = 0;
      next = next
        .map((item) => {
          if (item.productId !== line.productId || toTake <= EPS) return item;
          const take = Math.min(item.amount, toTake);
          toTake = roundAmount(toTake - take);
          actuallyTaken = roundAmount(actuallyTaken + take);
          return { ...item, amount: roundAmount(item.amount - take) };
        })
        .filter((item) => item.amount > EPS);
      consumption.push({ productId: line.productId, amount: roundAmount(had + actuallyTaken) });
      continue;
    }

    if (delta < -EPS) {
      // Zuzyl mniej. Roznica wraca do spizarni.
      next = giveBack(next, line.productId, -delta, now, newId);
    }
    consumption.push({ productId: line.productId, amount: wanted });
  }

  return { pantry: next, consumption };
}
