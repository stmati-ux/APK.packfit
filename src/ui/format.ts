import type { Product, Unit } from '../core/types.ts';
import type { ShoppingListItem } from '../core/optimizer.ts';
import type { IngredientStatus } from '../core/pantry.ts';

/**
 * Formatowanie tekstow na ekran. Wszystko po polsku, przecinek dziesietny.
 *
 * Tutaj mieszka jedna z twardych zasad ze specyfikacji: pozycje listy zakupow
 * MUSZA byc w opakowaniach, nie w gramach.
 */

/** 187 zł, bez groszy. Do wielkich liczb na podsumowaniu. */
export function zlRound(value: number): string {
  return `${Math.round(value)} zł`;
}

/** 5,29 zł. Do pozycji listy zakupow. */
export function zl(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} zł`;
}

/** 400 g, 1 szt, 0,5 szt. Ucina zbedne zera. */
export function amount(value: number, unit: Unit): string {
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded).replace('.', ',')} ${unit}`;
}

/**
 * Tresc pozycji na liscie zakupow.
 *
 *   dobrze: "Śmietana 18%, 1 opak. 400 g"
 *   źle:    "200 g śmietany"
 *
 * Produkt na wage nie dostaje slowa "opak.", bo kupujesz dokladnie tyle ile trzeba.
 */
export function shoppingLine(item: ShoppingListItem): string {
  if (item.product.soldAs === 'luz') {
    return `${item.product.name}, ${amount(item.needed - item.fromPantry, item.unit)}`;
  }
  return `${item.product.name}, ${item.packCount} opak. ${amount(item.packSize ?? 0, item.unit)}`;
}

/** "zostanie 40 g" albo null, gdy nic nie zostaje. */
export function leftoverNote(item: ShoppingListItem): string | null {
  if (item.leftover <= 0) return null;
  return `zostanie ${amount(item.leftover, item.unit)}`;
}

/** Status skladnika po prawej na ekranie przepisu. */
export function statusLabel(status: IngredientStatus, unit: Unit): string {
  switch (status.kind) {
    case 'have':
      return 'Masz';
    case 'partial':
      return `Brakuje ${amount(status.missing, unit)}`;
    case 'none':
      return 'Nie masz';
  }
}

/** "35 min · 4 porcje" */
export function recipeMeta(timeMinutes: number, servings: number): string {
  return `${timeMinutes} min · ${servings} ${porcje(servings)}`;
}

/** "5 obiadów · 4 osoby" */
export function planMeta(mealCount: number, people: number): string {
  return `${mealCount} ${obiady(mealCount)} · ${people} ${osoby(people)}`;
}

// --- polska odmiana przez liczbe -----------------------------------------

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

export const osoby = (n: number) => plural(n, 'osoba', 'osoby', 'osób');
export const obiady = (n: number) => plural(n, 'obiad', 'obiady', 'obiadów');
export const porcje = (n: number) => plural(n, 'porcja', 'porcje', 'porcji');
export const opakowania = (n: number) => plural(n, 'opakowanie', 'opakowania', 'opakowań');
export const dni = (n: number) => plural(n, 'dzień', 'dni', 'dni');
export const dan = (n: number) => plural(n, 'danie', 'dania', 'dań');
export const pozycje = (n: number) => plural(n, 'pozycja', 'pozycje', 'pozycji');

/** "dodano 18 sierpnia" — data neutralna, bez oceny swiezosci. */
const MONTHS = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

export function addedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `dodano ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
}

/** "12-18 sierpnia" albo "28 lipca - 3 sierpnia" przy zmianie miesiaca. */
export function dayRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';

  const fromMonth = MONTHS[from.getMonth()] ?? '';
  const toMonth = MONTHS[to.getMonth()] ?? '';
  if (fromMonth === toMonth) return `${from.getDate()}-${to.getDate()} ${toMonth}`;
  return `${from.getDate()} ${fromMonth} - ${to.getDate()} ${toMonth}`;
}

/** Nagłówek sekcji na liscie zakupow i w spizarni. */
export function categoryLabel(category: Product['category']): string {
  const labels: Record<Product['category'], string> = {
    warzywa: 'WARZYWA',
    nabial: 'NABIAŁ',
    mieso: 'MIĘSO',
    sypkie: 'SYPKIE',
    konserwy: 'KONSERWY',
    mrozonki: 'MROŻONKI',
    pieczywo: 'PIECZYWO',
    przyprawy: 'PRZYPRAWY',
  };
  return labels[category];
}
