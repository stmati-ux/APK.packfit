import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DietTag, Product, Recipe } from '../src/core/types.ts';
import {
  SHORTFALL_TOLERANCE_ABSOLUTE,
  SHORTFALL_TOLERANCE_RATIO,
  checkRecipe,
  ingredientAvailability,
  isCookableNow,
} from '../src/core/feasibility.ts';
import { SEED_PRODUCTS, SEED_RECIPES } from '../src/data/seed/index.ts';

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: id,
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

function recipe(ingredients: { productId: string; amount: number }[]): Recipe {
  return {
    id: 'r',
    name: 'r',
    baseServings: 4,
    timeMinutes: 30,
    instructions: '',
    tags: [],
    mainCategory: 'warzywa',
    dishCategory: 'inne',
    photoUrl: null,
    ingredients,
  };
}

// --- progi sa stalymi w jednym module -------------------------------------

test('progi tolerancji sa stalymi, nie liczbami rozsypanymi po kodzie', () => {
  assert.equal(SHORTFALL_TOLERANCE_RATIO, 0.15);
  assert.equal(SHORTFALL_TOLERANCE_ABSOLUTE, 5);
});

// --- status pojedynczego skladnika ----------------------------------------

test('pelny stan w spizarni to status masz', () => {
  assert.equal(ingredientAvailability(product('a'), 200, 200), 'masz');
  assert.equal(ingredientAvailability(product('a'), 200, 500), 'masz');
});

test('niedobor 20 g przy zapotrzebowaniu 200 g to prawie', () => {
  // 20 / 200 = 0.10, miesci sie w progu procentowym
  assert.equal(ingredientAvailability(product('a'), 200, 180), 'prawie');
});

test('niedobor 40 g przy zapotrzebowaniu 200 g to brak', () => {
  // 40 / 200 = 0.20, powyzej progu, i 40 g to duzo wiecej niz prog kwotowy
  assert.equal(ingredientAvailability(product('a'), 200, 160), 'brak');
});

test('niedobor 4 g przy zapotrzebowaniu 20 g to prawie mimo przekroczenia progu procentowego', () => {
  // 4 / 20 = 0.20, ale 4 g <= 5 g, wiec prog kwotowy ratuje
  assert.equal(ingredientAvailability(product('a'), 20, 16), 'prawie');
});

test('przyprawa jest tolerowana niezaleznie od skali niedoboru', () => {
  const spice = product('papryka', { category: 'przyprawy', unit: 'g', packSize: 20 });
  assert.equal(ingredientAvailability(spice, 10, 0), 'prawie');
  assert.equal(ingredientAvailability(spice, 1000, 0), 'prawie');
});

test('prog kwotowy nie dziala na sztuki, bo jajka nie da sie polowic', () => {
  const eggs = product('jajka', { unit: 'szt', packSize: 10 });
  // 2 z 10 sztuk to 20 procent, powyzej progu, a prog kwotowy sztuk nie dotyczy
  assert.equal(ingredientAvailability(eggs, 10, 8), 'brak');
});

// --- status calego przepisu -----------------------------------------------

const PRODUCTS = [
  product('a'),
  product('b'),
  product('przyprawa', { category: 'przyprawy', unit: 'g', packSize: 20 }),
];

test('przepis z kompletem skladnikow ma status zrobisz', () => {
  const check = checkRecipe(
    recipe([{ productId: 'a', amount: 200 }]),
    4,
    [{ productId: 'a', amount: 200 }],
    PRODUCTS,
  );
  assert.equal(check.status, 'zrobisz');
  assert.equal(check.ingredients[0]!.status, 'masz');
});

test('przepis z jednym skladnikiem brak ma status nie_zrobisz', () => {
  const check = checkRecipe(
    recipe([
      { productId: 'a', amount: 200 },
      { productId: 'b', amount: 200 },
    ]),
    4,
    [
      { productId: 'a', amount: 200 },
      { productId: 'b', amount: 100 },
    ],
    PRODUCTS,
  );
  assert.equal(check.status, 'nie_zrobisz');
  assert.equal(check.ingredients[1]!.status, 'brak');
});

test('sam ledwo wystarczajacy skladnik daje zrobisz_prawie', () => {
  const check = checkRecipe(
    recipe([
      { productId: 'a', amount: 200 },
      { productId: 'przyprawa', amount: 10 },
    ]),
    4,
    [{ productId: 'a', amount: 180 }],
    PRODUCTS,
  );
  assert.equal(check.status, 'zrobisz_prawie');
});

test('skaluje zapotrzebowanie liczba osob przed sprawdzeniem', () => {
  const r = recipe([{ productId: 'a', amount: 200 }]);
  // dla 8 osob potrzeba 400 g, wiec 200 g w spizarni to juz powazny brak
  assert.equal(checkRecipe(r, 8, [{ productId: 'a', amount: 200 }], PRODUCTS).status, 'nie_zrobisz');
  // dla 2 osob potrzeba 100 g, wiec 200 g wystarcza
  assert.equal(checkRecipe(r, 2, [{ productId: 'a', amount: 200 }], PRODUCTS).status, 'zrobisz');
});

test('filtr "moge zrobic z tego, co mam" przepuszcza zrobisz i zrobisz_prawie', () => {
  assert.equal(isCookableNow('zrobisz'), true);
  assert.equal(isCookableNow('zrobisz_prawie'), true);
  assert.equal(isCookableNow('nie_zrobisz'), false);
});

// --- wymaganie B1: filtry nie moga zostawiac pustej listy ------------------

test('po wlaczeniu kazdego pojedynczego wykluczenia zostaje minimum 30 przepisow', () => {
  const tags: DietTag[] = [
    'wieprzowina', 'wolowina', 'drob', 'ryba', 'laktoza', 'gluten', 'orzechy', 'jajka',
  ];

  for (const tag of tags) {
    const left = SEED_RECIPES.filter((r) => !r.tags.includes(tag));
    assert.ok(
      left.length >= 30,
      `po wykluczeniu "${tag}" zostaje tylko ${left.length} przepisow, potrzeba 30`,
    );
  }
});

test('baza przepisow ma zadany rozklad kategorii dania', () => {
  const count = (category: string) =>
    SEED_RECIPES.filter((r) => r.dishCategory === category).length;

  assert.ok(SEED_RECIPES.length >= 80, `przepisow jest ${SEED_RECIPES.length}, potrzeba 80`);
  assert.ok(count('makarony') >= 12, `makarony: ${count('makarony')}`);
  assert.ok(count('miesne') >= 20, `miesne: ${count('miesne')}`);
  assert.ok(count('wegetarianskie') >= 20, `wegetarianskie: ${count('wegetarianskie')}`);
  assert.ok(count('zupy') >= 12, `zupy: ${count('zupy')}`);
  assert.ok(count('szybkie') >= 12, `szybkie: ${count('szybkie')}`);
});

test('kazde danie szybkie faktycznie miesci sie w 20 minutach', () => {
  for (const recipe of SEED_RECIPES.filter((r) => r.dishCategory === 'szybkie')) {
    assert.ok(recipe.timeMinutes <= 20, `${recipe.name}: ${recipe.timeMinutes} min`);
  }
});

test('zaden przepis nie przekracza 45 minut', () => {
  for (const recipe of SEED_RECIPES) {
    assert.ok(recipe.timeMinutes <= 45, `${recipe.name}: ${recipe.timeMinutes} min`);
  }
});

test('kazdy skladnik wskazuje na istniejacy produkt', () => {
  const ids = new Set(SEED_PRODUCTS.map((p) => p.id));
  for (const recipe of SEED_RECIPES) {
    for (const ingredient of recipe.ingredients) {
      assert.ok(ids.has(ingredient.productId), `${recipe.name} -> ${ingredient.productId}`);
    }
  }
});
