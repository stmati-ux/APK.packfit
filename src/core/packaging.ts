import type { Product } from './types.ts';

/**
 * Logika opakowan. Czysty TypeScript, zero zaleznosci od Reacta.
 *
 * Cala teza produktu siedzi tutaj: sklep sprzedaje opakowania,
 * przepis potrzebuje gramow, a roznica laduje w koszu.
 */

/** Cena produktu sprzedawanego luzem dotyczy tylu jednostek. */
export const LOOSE_PRICE_BASE = 1000;

/**
 * Tolerancja na blad zmiennoprzecinkowy. Bez niej 400.0000000000001 g
 * potrzeby przy opakowaniu 400 g kazaloby kupic dwa opakowania.
 */
export const EPS = 1e-9;

/** Ucina szum zmiennoprzecinkowy na ilosciach pokazywanych uzytkownikowi. */
export function roundAmount(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Zaokragla do groszy. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Wartosc podanej ilosci produktu w PLN.
 * Dla opakowan liczona proporcjonalnie do gramatury, dla luzu wzgledem
 * LOOSE_PRICE_BASE.
 */
export function valueOf(product: Product, amount: number): number {
  if (amount <= 0) return 0;
  if (product.soldAs === 'luz') {
    return (amount / LOOSE_PRICE_BASE) * product.price;
  }
  const packSize = product.packSize ?? 1;
  return (amount / packSize) * product.price;
}

export interface Purchase {
  /** Ile trzeba dokupic po odjeciu spizarni (spec: brakujaca). */
  missing: number;
  /** Ile pokrywa spizarnia. */
  fromPantry: number;
  /** Liczba opakowan do kupienia. 0 dla produktow luzem. */
  packCount: number;
  /** Ile faktycznie wejdzie do domu. */
  bought: number;
  /** Ile zostanie po ugotowaniu wszystkiego z planu. */
  leftover: number;
  /** Koszt tej pozycji w PLN. */
  cost: number;
}

const EMPTY_PURCHASE: Purchase = {
  missing: 0,
  fromPantry: 0,
  packCount: 0,
  bought: 0,
  leftover: 0,
  cost: 0,
};

/**
 * Przeklada zapotrzebowanie na realny zakup.
 *
 * Kolejnosc jest istotna: NAJPIERW odejmujemy to, co uzytkownik juz ma,
 * dopiero potem zaokraglamy w gore do pelnych opakowan.
 *
 * @param required     ile dania z planu potrzebuja lacznie
 * @param pantryAmount ile jest w spizarni
 */
export function planPurchase(
  product: Product,
  required: number,
  pantryAmount: number,
): Purchase {
  if (required <= EPS) {
    return { ...EMPTY_PURCHASE, fromPantry: 0 };
  }

  const fromPantry = Math.min(Math.max(pantryAmount, 0), required);
  const missing = required - fromPantry;

  // Produkt w pelni pokryty ze spizarni nie trafia na liste zakupow.
  if (missing <= EPS) {
    return { ...EMPTY_PURCHASE, fromPantry: roundAmount(fromPantry) };
  }

  // Luz: kupujesz dokladnie tyle ile trzeba, wiec resztka nie powstaje.
  if (product.soldAs === 'luz') {
    return {
      missing: roundAmount(missing),
      fromPantry: roundAmount(fromPantry),
      packCount: 0,
      bought: roundAmount(missing),
      leftover: 0,
      cost: valueOf(product, missing),
    };
  }

  const packSize = product.packSize ?? 1;
  const packCount = Math.ceil(missing / packSize - EPS);
  const bought = packCount * packSize;

  return {
    missing: roundAmount(missing),
    fromPantry: roundAmount(fromPantry),
    packCount,
    bought: roundAmount(bought),
    leftover: roundAmount(Math.max(0, bought - missing)),
    cost: packCount * product.price,
  };
}

/**
 * Wartosc realnie zmarnowanej resztki.
 *
 * Liczy sie WYLACZNIE dla produktow psujacych sie. Resztka ryzu, makaronu
 * czy oleju zostaje w spizarni i zostanie zuzyta, wiec nie jest strata.
 * Bez tego rozroznienia algorytm optymalizuje nie to co trzeba.
 */
export function wasteValue(product: Product, leftover: number): number {
  if (!product.perishable) return 0;
  return valueOf(product, leftover);
}
