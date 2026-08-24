import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PantryItem, Product, Recipe } from '../src/core/types.ts';
import {
  addManualToPantry,
  addPurchaseToPantry,
  adjustPantryItem,
  cookRecipe,
  correctConsumption,
  ingredientStatus,
  markCooked,
  pantryTotals,
  perishableValue,
  removePantryItem,
  undoCooked,
} from '../src/core/pantry.ts';

let counter = 0;
const newId = () => `id-${++counter}`;
const NOW = '2026-08-21T10:00:00.000Z';

function item(productId: string, amount: number, addedAt = NOW): PantryItem {
  return { id: newId(), userId: null, productId, amount, addedAt, source: 'zakupy' };
}

const RECIPE: Recipe = {
  id: 'test',
  name: 'Test',
  baseServings: 4,
  timeMinutes: 20,
  instructions: '',
  tags: [],
  mainCategory: 'warzywa',
  dishCategory: 'inne',
  photoUrl: null,
  ingredients: [
    { productId: 'smietana', amount: 200 },
    { productId: 'ryz', amount: 300 },
  ],
};

// --- wymaganie 7: odejmowanie nie schodzi ponizej zera --------------------

test('odejmowanie przy gotowaniu nigdy nie schodzi ponizej zera', () => {
  const pantry = [item('smietana', 50), item('ryz', 100)];
  const result = cookRecipe(pantry, RECIPE, 4);

  for (const entry of result.pantry) {
    assert.ok(entry.amount >= 0, 'zadna pozycja nie moze byc ujemna');
  }
  assert.equal(result.pantry.length, 0, 'wyzerowane pozycje znikaja');
});

test('braki sa raportowane, ale gotowanie i tak przechodzi', () => {
  const pantry = [item('smietana', 50)];
  const result = cookRecipe(pantry, RECIPE, 4);

  assert.deepEqual(result.consumed, [{ productId: 'smietana', amount: 50 }]);
  assert.deepEqual(result.shortfalls, [
    { productId: 'smietana', amount: 150 },
    { productId: 'ryz', amount: 300 },
  ]);
});

test('odejmuje dokladnie tyle ile trzeba, reszta zostaje', () => {
  const pantry = [item('smietana', 400), item('ryz', 1000)];
  const result = cookRecipe(pantry, RECIPE, 4);

  const totals = new Map(pantryTotals(result.pantry).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 200);
  assert.equal(totals.get('ryz'), 700);
});

test('skaluje odejmowanie liczba osob', () => {
  const pantry = [item('smietana', 400), item('ryz', 1000)];
  const result = cookRecipe(pantry, RECIPE, 2);

  const totals = new Map(pantryTotals(result.pantry).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 300, 'dla 2 osob schodzi polowa ze 200 g');
  assert.equal(totals.get('ryz'), 850);
});

test('zuzywa najstarsze partie jako pierwsze', () => {
  const older = item('smietana', 100, '2026-08-01T10:00:00.000Z');
  const newer = item('smietana', 400, '2026-08-20T10:00:00.000Z');
  const result = cookRecipe([newer, older], RECIPE, 4);

  const remaining = result.pantry.filter((p) => p.productId === 'smietana');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.id, newer.id, 'starsza partia schodzi w calosci');
  assert.equal(remaining[0]!.amount, 300);
});

// --- zasilanie spizarni z listy zakupow -----------------------------------

const CREAM: Product = {
  id: 'smietana',
  name: 'Śmietana 18%',
  category: 'nabial',
  unit: 'g',
  soldAs: 'opakowanie',
  packSize: 400,
  price: 5.29,
  perishable: true,
  verified: false,
};

test('odhaczenie zakupu dodaje PELNE opakowanie, nie ilosc z przepisu', () => {
  const pantry = addPurchaseToPantry([], CREAM, 1, NOW, newId);
  assert.equal(pantry.length, 1);
  assert.equal(pantry[0]!.amount, 400, 'kupil 400 g, wiec ma 400 g');
  assert.equal(pantry[0]!.source, 'zakupy');
  assert.equal(pantry[0]!.userId, null, 'userId nullowalne od poczatku');
});

test('dwa opakowania to dwa razy gramatura', () => {
  const pantry = addPurchaseToPantry([], CREAM, 2, NOW, newId);
  assert.equal(pantry[0]!.amount, 800);
});

test('produkt luzem wchodzi w kupionej ilosci', () => {
  const potatoes: Product = { ...CREAM, id: 'ziemniaki', soldAs: 'luz', packSize: null };
  const pantry = addPurchaseToPantry([], potatoes, 450, NOW, newId);
  assert.equal(pantry[0]!.amount, 450);
});

test('reczne dodanie jest oznaczone jako sciezka poboczna', () => {
  const pantry = addManualToPantry([], 'ryz', 500, NOW, newId);
  assert.equal(pantry[0]!.source, 'reczne');
});

// --- reczna korekta -------------------------------------------------------

test('korekta ilosci nie schodzi ponizej zera', () => {
  const entry = item('ryz', 500);
  assert.deepEqual(adjustPantryItem([entry], entry.id, -100), []);
});

test('korekta do zera usuwa pozycje', () => {
  const entry = item('ryz', 500);
  assert.deepEqual(adjustPantryItem([entry], entry.id, 0), []);
});

test('usuwanie pozycji dziala po id', () => {
  const a = item('ryz', 500);
  const b = item('smietana', 400);
  assert.deepEqual(removePantryItem([a, b], a.id), [b]);
});

// --- status skladnika na ekranie przepisu ---------------------------------

test('status skladnika: Masz, Brakuje, Nie masz', () => {
  const pantry = [item('smietana', 150)];

  assert.deepEqual(ingredientStatus(pantry, 'smietana', 100), { kind: 'have' });
  assert.deepEqual(ingredientStatus(pantry, 'smietana', 200), { kind: 'partial', missing: 50 });
  assert.deepEqual(ingredientStatus(pantry, 'ryz', 300), { kind: 'none' });
});

test('status sumuje kilka partii tego samego produktu', () => {
  const pantry = [item('smietana', 100), item('smietana', 150)];
  assert.deepEqual(ingredientStatus(pantry, 'smietana', 250), { kind: 'have' });
});

// --- oznaczenie ugotowane, cofniecie i korekta ----------------------------

test('oznaczenie jako ugotowane odejmuje wlasciwe ilosci ze spizarni', () => {
  const pantry = [item('smietana', 400), item('ryz', 1000)];
  const result = markCooked(pantry, RECIPE, 4);

  const totals = new Map(pantryTotals(result.pantry).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 200);
  assert.equal(totals.get('ryz'), 700);
  assert.deepEqual(result.consumption, [
    { productId: 'smietana', amount: 200 },
    { productId: 'ryz', amount: 300 },
  ]);
});

test('zuzycie obejmuje takze skladniki, ktorych w spizarni nie bylo wcale', () => {
  const result = markCooked([item('smietana', 50)], RECIPE, 4);
  assert.deepEqual(result.consumption, [
    { productId: 'smietana', amount: 50 },
    { productId: 'ryz', amount: 0 },
  ]);
});

test('odjecie nie schodzi ponizej zera przy niedoborze', () => {
  const result = markCooked([item('smietana', 50)], RECIPE, 4);
  for (const entry of result.pantry) assert.ok(entry.amount >= 0);
  assert.equal(result.consumption.find((c) => c.productId === 'ryz')!.amount, 0);
});

test('odznaczenie zwraca dokladnie te ilosci, ktore zostaly odjete', () => {
  const start = [item('smietana', 400), item('ryz', 1000)];
  const cooked = markCooked(start, RECIPE, 4);
  const back = undoCooked(cooked.pantry, cooked.consumption, NOW, newId);

  const totals = new Map(pantryTotals(back).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 400, 'spizarnia wraca do stanu sprzed gotowania');
  assert.equal(totals.get('ryz'), 1000);
});

test('korekta zuzycia modyfikuje spizarnie o roznice, nie o pelna wartosc', () => {
  const start = [item('smietana', 400), item('ryz', 1000)];
  const cooked = markCooked(start, RECIPE, 4); // zeszlo 200 i 300

  // uzytkownik poprawia: smietany zuzyl 250, ryzu tylko 100
  const corrected = correctConsumption(
    cooked.pantry,
    cooked.consumption,
    [
      { productId: 'smietana', amount: 250 },
      { productId: 'ryz', amount: 100 },
    ],
    NOW,
    newId,
  );

  const totals = new Map(pantryTotals(corrected.pantry).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 150, '400 minus 250, a nie 200 minus 250');
  assert.equal(totals.get('ryz'), 900, '1000 minus 100, roznica 200 wrocila');
});

test('odznaczenie po korekcie zwraca poprawione ilosci, nie te z przepisu', () => {
  const start = [item('smietana', 400), item('ryz', 1000)];
  const cooked = markCooked(start, RECIPE, 4);
  const corrected = correctConsumption(
    cooked.pantry,
    cooked.consumption,
    [
      { productId: 'smietana', amount: 250 },
      { productId: 'ryz', amount: 100 },
    ],
    NOW,
    newId,
  );

  const back = undoCooked(corrected.pantry, corrected.consumption, NOW, newId);
  const totals = new Map(pantryTotals(back).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 400);
  assert.equal(totals.get('ryz'), 1000);
});

test('korekta do zera oddaje calosc, korekta ujemna jest przycinana do zera', () => {
  const start = [item('smietana', 400), item('ryz', 1000)];
  const cooked = markCooked(start, RECIPE, 4);

  const corrected = correctConsumption(
    cooked.pantry,
    cooked.consumption,
    [
      { productId: 'smietana', amount: 0 },
      { productId: 'ryz', amount: -50 },
    ],
    NOW,
    newId,
  );

  assert.deepEqual(corrected.consumption, [
    { productId: 'smietana', amount: 0 },
    { productId: 'ryz', amount: 0 },
  ]);
  const totals = new Map(pantryTotals(corrected.pantry).map((t) => [t.productId, t.amount]));
  assert.equal(totals.get('smietana'), 400);
  assert.equal(totals.get('ryz'), 1000);
});

test('korekta w gore ponad stan spizarni zapisuje ilosc faktycznie zdjeta', () => {
  const start = [item('smietana', 220)];
  const cooked = markCooked(start, RECIPE, 4); // zeszlo 200, zostalo 20

  const corrected = correctConsumption(
    cooked.pantry,
    cooked.consumption,
    [{ productId: 'smietana', amount: 400 }],
    NOW,
    newId,
  );

  assert.equal(
    corrected.consumption[0]!.amount,
    220,
    'wiecej niz bylo w spizarni sie nie da, zapisujemy realne 220',
  );
  assert.equal(pantryTotals(corrected.pantry).length, 0);
});

// --- D3: faktyczna wartosc resztek przy zamknieciu tygodnia ---------------

test('archiwizacja liczy resztki WYLACZNIE z produktow psujacych sie', () => {
  const products: Product[] = [
    { ...CREAM, id: 'smietana', packSize: 400, price: 10, perishable: true },
    { ...CREAM, id: 'ryz', packSize: 1000, price: 20, perishable: false, category: 'sypkie' },
    { ...CREAM, id: 'ziemniaki', soldAs: 'luz', packSize: null, price: 4, perishable: false },
  ];

  const value = perishableValue(
    [item('smietana', 200), item('ryz', 500), item('ziemniaki', 1000)],
    products,
  );

  // 200 z 400 g smietany po 10 zl to 5 zl. Ryz i ziemniaki sie nie licza,
  // bo zostaja w spizarni na kolejny tydzien.
  assert.equal(value, 5);
});

test('pusta spizarnia to zero resztek', () => {
  assert.equal(perishableValue([], [CREAM]), 0);
});

test('produkt spoza katalogu nie wywala liczenia', () => {
  assert.equal(perishableValue([item('nie-ma-takiego', 500)], [CREAM]), 0);
});
