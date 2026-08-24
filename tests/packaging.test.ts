import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Product } from '../src/core/types.ts';
import { planPurchase, valueOf, wasteValue } from '../src/core/packaging.ts';

function pack(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p',
    name: 'Produkt',
    category: 'nabial',
    unit: 'g',
    soldAs: 'opakowanie',
    packSize: 400,
    price: 10,
    perishable: true,
    verified: false,
    ...overrides,
  };
}

function loose(overrides: Partial<Product> = {}): Product {
  return pack({ soldAs: 'luz', packSize: null, category: 'warzywa', price: 4, ...overrides });
}

// --- wymaganie 1: zaokraglanie liczby opakowan w gore ----------------------

test('zaokragla liczbe opakowan w gore', () => {
  const result = planPurchase(pack(), 450, 0);
  assert.equal(result.packCount, 2);
  assert.equal(result.bought, 800);
  assert.equal(result.leftover, 350);
  assert.equal(result.cost, 20);
});

test('dokladnie jedno opakowanie nie zamienia sie w dwa przez blad zmiennoprzecinkowy', () => {
  // 0.1 + 0.2 !== 0.3 w IEEE754. Trzykrotne 133.33... musi dac 1 opakowanie.
  const required = 133.33333333333334 * 3;
  const result = planPurchase(pack({ packSize: 400 }), required, 0);
  assert.equal(result.packCount, 1);
  assert.equal(result.leftover, 0);
});

// --- wymaganie 2: luz nie generuje strat ----------------------------------

test('produkt sprzedawany luzem nie generuje resztki', () => {
  const product = loose();
  const result = planPurchase(product, 450, 0);
  assert.equal(result.packCount, 0);
  assert.equal(result.bought, 450);
  assert.equal(result.leftover, 0);
  assert.equal(wasteValue(product, result.leftover), 0);
});

// --- wymaganie 3: produkty nie psujace sie nie licza sie jako strata ------

test('resztka produktu nie psujacego sie nie jest strata', () => {
  const rice = pack({ perishable: false, packSize: 1000, price: 9 });
  const result = planPurchase(rice, 300, 0);
  assert.equal(result.leftover, 700);
  assert.equal(wasteValue(rice, result.leftover), 0);
});

test('resztka produktu psujacego sie JEST strata', () => {
  const cream = pack({ packSize: 400, price: 10, perishable: true });
  const result = planPurchase(cream, 300, 0);
  assert.equal(result.leftover, 100);
  assert.equal(wasteValue(cream, result.leftover), 2.5);
});

// --- wymaganie 5: spizarnia odejmowana PRZED liczeniem opakowan ------------

test('odejmuje spizarnie zanim policzy opakowania', () => {
  // 600 potrzebne, 300 w domu. Brakuje 300, czyli JEDNO opakowanie 400 g.
  // Bez odjecia spizarni wyszlyby dwa.
  const result = planPurchase(pack({ packSize: 400 }), 600, 300);
  assert.equal(result.fromPantry, 300);
  assert.equal(result.missing, 300);
  assert.equal(result.packCount, 1);
  assert.equal(result.leftover, 100);
});

// --- wymaganie 6: produkt w pelni pokryty ze spizarni --------------------

test('produkt w pelni pokryty ze spizarni nie generuje zakupu', () => {
  const result = planPurchase(pack(), 200, 400);
  assert.equal(result.packCount, 0);
  assert.equal(result.bought, 0);
  assert.equal(result.cost, 0);
  assert.equal(result.fromPantry, 200, 'ze spizarni schodzi tylko tyle ile potrzeba');
});

test('spizarnia pokrywajaca dokladnie tyle ile trzeba tez nie generuje zakupu', () => {
  const result = planPurchase(pack(), 400, 400);
  assert.equal(result.packCount, 0);
  assert.equal(result.cost, 0);
});

// --- wycena ---------------------------------------------------------------

test('wycenia opakowanie proporcjonalnie do gramatury', () => {
  assert.equal(valueOf(pack({ packSize: 400, price: 10 }), 100), 2.5);
});

test('wycenia luz wzgledem 1000 jednostek', () => {
  assert.equal(valueOf(loose({ price: 4 }), 500), 2);
});

test('zerowa i ujemna ilosc ma wartosc zero', () => {
  assert.equal(valueOf(pack(), 0), 0);
  assert.equal(valueOf(pack(), -50), 0);
});
