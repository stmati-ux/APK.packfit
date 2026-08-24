import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Catalog, Product, Recipe } from '../src/core/types.ts';
import {
  PlanError,
  combinationCount,
  createPlan,
  dishCount,
  planForMeals,
  scaleAmount,
  swapMeal,
} from '../src/core/optimizer.ts';
import { SEED_PRODUCTS, SEED_RECIPES } from '../src/data/seed/index.ts';

const SEED: Catalog = { products: SEED_PRODUCTS, recipes: SEED_RECIPES };

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

function recipe(id: string, overrides: Partial<Recipe> = {}): Recipe {
  return {
    id,
    name: id,
    baseServings: 4,
    timeMinutes: 30,
    instructions: '',
    tags: [],
    mainCategory: 'warzywa',
    dishCategory: 'inne',
    photoUrl: null,
    ingredients: [],
    ...overrides,
  };
}

// --- wymaganie 4: twardy filtr wykluczen ----------------------------------

test('filtr wykluczen dziala twardo, nie jako preferencja', () => {
  const catalog: Catalog = {
    products: [product('a'), product('b')],
    recipes: [
      recipe('z-laktoza', { tags: ['laktoza'], ingredients: [{ productId: 'a', amount: 100 }] }),
      recipe('bez-laktozy', { ingredients: [{ productId: 'b', amount: 100 }] }),
    ],
  };

  const plan = createPlan(
    { people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: ['laktoza'], pantry: [] },
    catalog,
  );

  assert.equal(plan.meals.length, 1);
  assert.equal(plan.meals[0]!.id, 'bez-laktozy');
});

test('zaden przepis z wykluczonym tagiem nie przechodzi, nawet gdy jest tanszy', () => {
  const catalog: Catalog = {
    products: [product('tani', { price: 1 }), product('drogi', { price: 100 })],
    recipes: [
      recipe('tani-z-gluten', { tags: ['gluten'], ingredients: [{ productId: 'tani', amount: 400 }] }),
      recipe('drogi-czysty', { ingredients: [{ productId: 'drogi', amount: 400 }] }),
    ],
  };

  const plan = createPlan({ people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: ['gluten'], pantry: [] }, catalog);
  assert.equal(plan.meals[0]!.id, 'drogi-czysty');
});

test('rzuca bledem gdy po wykluczeniach zostaje za malo przepisow', () => {
  const catalog: Catalog = {
    products: [product('a')],
    recipes: [recipe('jedyny', { tags: ['ryba'], ingredients: [{ productId: 'a', amount: 100 }] })],
  };

  assert.throws(
    () => createPlan({ people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: ['ryba'], pantry: [] }, catalog),
    (err: unknown) => err instanceof PlanError && err.code === 'NOT_ENOUGH_RECIPES',
  );
});

// --- wymaganie 8: bonus za zuzycie zapasow zmienia wybor planu -------------

const BONUS_CATALOG: Catalog = {
  products: [
    product('smietana', { packSize: 400, price: 10, perishable: true }),
    product('kasza', { packSize: 400, price: 10, perishable: false, category: 'sypkie' }),
  ],
  recipes: [
    recipe('ze-smietana', {
      mainCategory: 'nabial',
      ingredients: [{ productId: 'smietana', amount: 300 }],
    }),
    recipe('z-kasza', {
      mainCategory: 'warzywa',
      ingredients: [{ productId: 'kasza', amount: 300 }],
    }),
  ],
};

test('bez zapasow wygrywa danie, ktore nie zostawia psujacej sie resztki', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: [], pantry: [] }, BONUS_CATALOG);
  assert.equal(plan.meals[0]!.id, 'z-kasza');
  assert.equal(plan.leftoverValue, 0);
});

test('bonus za zapasy faktycznie zmienia wybor planu', () => {
  const plan = createPlan(
    {
      people: 4,
      daysWithDinner: 1, daysPerDish: 1,
      excludedTags: [],
      pantry: [{ productId: 'smietana', amount: 300 }],
    },
    BONUS_CATALOG,
  );

  assert.equal(
    plan.meals[0]!.id,
    'ze-smietana',
    'plan ma sprzatac po poprzednim tygodniu, a nie unikac otwartej smietany',
  );
});

// --- wymaganie 6 na poziomie planu ----------------------------------------

test('produkt w pelni pokryty ze spizarni nie pojawia sie na liscie zakupow', () => {
  const plan = createPlan(
    {
      people: 4,
      daysWithDinner: 1, daysPerDish: 1,
      excludedTags: [],
      pantry: [{ productId: 'smietana', amount: 300 }],
    },
    BONUS_CATALOG,
  );

  assert.equal(plan.meals[0]!.id, 'ze-smietana');
  assert.equal(plan.shoppingList.length, 0);
  assert.equal(plan.totalCost, 0);
});

// --- skalowanie -----------------------------------------------------------

test('skaluje skladniki liczba osob', () => {
  assert.equal(scaleAmount(400, 2, 4), 200);
  assert.equal(scaleAmount(400, 6, 4), 600);
});

test('dwie osoby kupuja mniej niz cztery', () => {
  const forTwo = createPlan({ people: 2, daysWithDinner: 3, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  const forFour = createPlan({ people: 4, daysWithDinner: 3, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  assert.ok(forTwo.totalCost < forFour.totalCost);
});

// --- kombinatoryka --------------------------------------------------------

test('liczy kombinacje bez powtorzen', () => {
  assert.equal(combinationCount(30, 5), 142506);
  assert.equal(combinationCount(29, 6), 475020);
  assert.equal(combinationCount(5, 0), 1);
  assert.equal(combinationCount(3, 5), 0);
});

// --- walidacja wejscia ----------------------------------------------------

test('odrzuca bezsensowne wejscie', () => {
  for (const bad of [0, -1, Number.NaN]) {
    assert.throws(
      () => createPlan({ people: bad, daysWithDinner: 3, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED),
      (err: unknown) => err instanceof PlanError && err.code === 'INVALID_INPUT',
    );
  }
});

// --- na prawdziwym seedzie ------------------------------------------------

test('uklada plan na prawdziwych danych i pokazuje punkt odniesienia', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);

  assert.equal(plan.meals.length, 5);
  assert.equal(new Set(plan.meals.map((m) => m.id)).size, 5, 'bez powtorzonych dan');
  assert.ok(plan.shoppingList.length > 0);
  assert.ok(plan.totalCost > 0);
  assert.ok(plan.combinationsChecked > 0);
  assert.ok(
    plan.leftoverValue <= plan.averagePlanLeftoverValue,
    'wybrany plan nie moze marnowac wiecej niz srednia',
  );
  assert.equal(
    plan.savings,
    Math.round((plan.averagePlanLeftoverValue - plan.leftoverValue) * 100) / 100,
  );
});

test('lista zakupow trzyma kolejnosc obchodzenia sklepu', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  const order = ['warzywa', 'nabial', 'mieso', 'sypkie', 'konserwy', 'mrozonki', 'pieczywo', 'przyprawy'];
  const positions = plan.shoppingList.map((item) => order.indexOf(item.product.category));

  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i]! >= positions[i - 1]!, 'kategorie musza isc w kolejnosci sklepu');
  }
});

test('pozycje na liscie sa w opakowaniach, nie w gramach', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);

  for (const item of plan.shoppingList) {
    if (item.product.soldAs === 'opakowanie') {
      assert.ok(item.packCount >= 1, `${item.product.name} musi miec liczbe opakowan`);
      assert.equal(item.packSize, item.product.packSize);
    } else {
      assert.equal(item.packCount, 0, `${item.product.name} jest na wage`);
    }
  }
});

test('generowanie planu miesci sie ponizej 500 ms', () => {
  const started = performance.now();
  createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  const elapsed = performance.now() - started;

  assert.ok(elapsed < 500, `plan liczyl sie ${elapsed.toFixed(0)} ms, limit to 500 ms`);
});

// --- checkbox "mam juz w domu" --------------------------------------------

const OWNED_CATALOG: Catalog = {
  products: [product('a', { packSize: 400, price: 10, perishable: true })],
  recipes: [recipe('danie', { ingredients: [{ productId: 'a', amount: 300 }] })],
};

test('bez zaznaczenia produkt normalnie trafia na liste zakupow', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: [], pantry: [] }, OWNED_CATALOG);
  assert.equal(plan.shoppingList.length, 1);
  assert.equal(plan.totalCost, 10);
  assert.equal(plan.leftoverValue, 2.5);
});

test('"mam juz w domu" usuwa produkt z listy zakupow', () => {
  const plan = createPlan(
    { people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: [], pantry: [], ownedProductIds: ['a'] },
    OWNED_CATALOG,
  );
  assert.equal(plan.shoppingList.length, 0);
  assert.equal(plan.totalCost, 0);
});

test('"mam juz w domu" nie generuje straty', () => {
  const plan = createPlan(
    { people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: [], pantry: [], ownedProductIds: ['a'] },
    OWNED_CATALOG,
  );
  assert.equal(plan.leftoverValue, 0, 'skoro nic nie kupujemy, nic nie moze sie zmarnowac');
});

test('"mam juz w domu" obniza koszt calego planu na prawdziwych danych', () => {
  const base = { people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] };
  const withoutOwned = createPlan(base, SEED);
  const withOwned = createPlan({ ...base, ownedProductIds: ['sol', 'pieprz', 'olej'] }, SEED);

  assert.ok(withOwned.totalCost < withoutOwned.totalCost);
  for (const id of ['sol', 'pieprz', 'olej']) {
    assert.ok(
      !withOwned.shoppingList.some((i) => i.product.id === id),
      `${id} nie moze byc na liscie`,
    );
  }
});

test('nieznane id w "mam juz w domu" jest ignorowane, nie wywala planu', () => {
  const plan = createPlan(
    { people: 4, daysWithDinner: 1, daysPerDish: 1, excludedTags: [], pantry: [], ownedProductIds: ['nie-istnieje'] },
    OWNED_CATALOG,
  );
  assert.equal(plan.shoppingList.length, 1);
});

// --- przeliczanie przy ustalonym zestawie dan -----------------------------

test('planForMeals liczy dokladnie dla podanych dan', () => {
  const full = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  const ids = full.meals.map((m) => m.id);

  const same = planForMeals({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED, ids);

  assert.deepEqual(same.meals.map((m) => m.id).sort(), [...ids].sort());
  assert.equal(same.totalCost, full.totalCost);
  assert.equal(same.leftoverValue, full.leftoverValue);
});

test('planForMeals bez punktu odniesienia dalby oszczednosc zero', () => {
  const full = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  const ids = full.meals.map((m) => m.id);
  const input = { people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] };

  const naive = planForMeals(input, SEED, ids);
  assert.equal(naive.savings, 0, 'jedna kombinacja, wiec srednia rowna sie wynikowi');

  const withBaseline = planForMeals(input, SEED, ids, undefined, full.averagePlanLeftoverValue);
  assert.equal(withBaseline.averagePlanLeftoverValue, full.averagePlanLeftoverValue);
  assert.equal(withBaseline.savings, full.savings);
});

test('swapMeal podmienia jedno danie i zachowuje kolejnosc pozostalych', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  const ids = plan.meals.map((m) => m.id);
  const target = ids[2]!;

  const swapped = swapMeal(
    { people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] },
    SEED,
    ids,
    target,
    undefined,
    plan.averagePlanLeftoverValue,
  );

  const newIds = swapped.meals.map((m) => m.id);
  assert.equal(newIds.length, 5);
  assert.ok(!newIds.includes(target), 'wymienione danie musi zniknac');
  assert.equal(newIds[0], ids[0], 'pozostale dania zostaja na swoich miejscach');
  assert.equal(newIds[1], ids[1]);
  assert.equal(newIds[3], ids[3]);
  assert.equal(newIds[4], ids[4]);
  assert.equal(new Set(newIds).size, 5, 'bez duplikatow');
});

test('swapMeal odrzuca danie spoza planu', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  assert.throws(
    () =>
      swapMeal(
        { people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] },
        SEED,
        plan.meals.map((m) => m.id),
        'nie-ma-takiego-dania',
      ),
    (err: unknown) => err instanceof PlanError && err.code === 'INVALID_INPUT',
  );
});

test('swapMeal respektuje wykluczenia przy szukaniu zastepstwa', () => {
  const input = { people: 4, daysWithDinner: 4, daysPerDish: 1, excludedTags: ['ryba'] as const, pantry: [] };
  const plan = createPlan({ ...input, excludedTags: ['ryba'] }, SEED);
  const ids = plan.meals.map((m) => m.id);

  const swapped = swapMeal({ ...input, excludedTags: ['ryba'] }, SEED, ids, ids[0]!);

  for (const meal of swapped.meals) {
    assert.ok(!meal.tags.includes('ryba'), `${meal.name} zawiera wykluczony tag`);
  }
});

// --- dania przypiete ------------------------------------------------------

test('optymalizator zawsze zawiera dania przypiete w zwroconym planie', () => {
  const pinned = ['spaghetti-bolognese', 'zupa-jarzynowa'];
  const plan = createPlan(
    { people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [], pinnedRecipeIds: pinned },
    SEED,
  );

  const ids = plan.meals.map((m) => m.id);
  assert.equal(ids.length, 5);
  for (const id of pinned) assert.ok(ids.includes(id), `${id} musi byc w planie`);
  assert.deepEqual(plan.pinned.map((r) => r.id).sort(), [...pinned].sort());
});

test('dania przypiete nie powtarzaja sie w puli do dobrania', () => {
  const plan = createPlan(
    {
      people: 4,
      daysWithDinner: 4, daysPerDish: 1,
      excludedTags: [],
      pantry: [],
      pinnedRecipeIds: ['schabowy'],
    },
    SEED,
  );
  const ids = plan.meals.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'bez duplikatow');
  assert.equal(ids.filter((id) => id === 'schabowy').length, 1);
});

test('gdy przypietych jest wiecej niz zaplanowano, liczba posilkow rosnie', () => {
  const pinned = ['spaghetti-bolognese', 'zupa-jarzynowa', 'schabowy', 'omlet-z-warzywami'];
  const plan = createPlan(
    { people: 4, daysWithDinner: 2, daysPerDish: 1, excludedTags: [], pantry: [], pinnedRecipeIds: pinned },
    SEED,
  );

  assert.equal(plan.dishCount, 4, 'plan rozszerza sie do liczby przypietych');
  assert.equal(plan.meals.length, 4);
  assert.deepEqual(plan.meals.map((m) => m.id).sort(), [...pinned].sort());
});

test('gdy przypiete wypelniaja plan, nadal liczy liste zakupow i koszt', () => {
  const plan = createPlan(
    {
      people: 4,
      daysWithDinner: 2, daysPerDish: 1,
      excludedTags: [],
      pantry: [],
      pinnedRecipeIds: ['spaghetti-bolognese', 'schabowy'],
    },
    SEED,
  );

  assert.equal(plan.meals.length, 2);
  assert.ok(plan.shoppingList.length > 0, 'lista zakupow musi powstac');
  assert.ok(plan.totalCost > 0);
});

test('danie przypiete wchodzi do planu mimo wykluczonego tagu', () => {
  // spaghetti-bolognese ma tag wieprzowina, a mimo to user je przypial
  const plan = createPlan(
    {
      people: 4,
      daysWithDinner: 3, daysPerDish: 1,
      excludedTags: ['wieprzowina'],
      pantry: [],
      pinnedRecipeIds: ['spaghetti-bolognese'],
    },
    SEED,
  );

  const ids = plan.meals.map((m) => m.id);
  assert.ok(ids.includes('spaghetti-bolognese'), 'wlasna decyzja usera jest nadrzedna');
  for (const meal of plan.meals) {
    if (meal.id === 'spaghetti-bolognese') continue;
    assert.ok(!meal.tags.includes('wieprzowina'), 'dobrane dania nadal respektuja wykluczenia');
  }
});

test('nie da sie wymienic dania przypietego', () => {
  const input = {
    people: 4,
    daysWithDinner: 4, daysPerDish: 1,
    excludedTags: [],
    pantry: [],
    pinnedRecipeIds: ['schabowy'],
  };
  const plan = createPlan(input, SEED);

  assert.throws(
    () => swapMeal(input, SEED, plan.meals.map((m) => m.id), 'schabowy'),
    (err: unknown) => err instanceof PlanError && err.code === 'INVALID_INPUT',
  );
});

test('bez przypietych plan zachowuje sie jak wczesniej', () => {
  const plan = createPlan({ people: 4, daysWithDinner: 5, daysPerDish: 1, excludedTags: [], pantry: [] }, SEED);
  assert.deepEqual(plan.pinned, []);
  assert.equal(plan.dishCount, 5);
});

// --- C1: gotowanie na kilka dni -------------------------------------------

test('liczba dan wyliczana z zaokragleniem w gore', () => {
  assert.equal(dishCount(5, 1), 5, '5 dni po jednym daniu to 5 dan');
  assert.equal(dishCount(5, 2), 3, '5 dni po dwa dni na danie to 3 dania, nie 2,5');
  assert.equal(dishCount(7, 3), 3);
  assert.equal(dishCount(6, 2), 3);
  assert.equal(dishCount(1, 3), 1, 'zawsze przynajmniej jedno danie');
});

test('skalowanie uwzglednia jednoczesnie liczbe osob i liczbe dni', () => {
  // 400 g na 4 porcje bazowe, gotujemy dla 6 osob na 2 dni
  assert.equal(scaleAmount(400, 6, 4, 2), 1200);
  assert.equal(scaleAmount(400, 4, 4, 1), 400);
  assert.equal(scaleAmount(400, 2, 4, 3), 600);
});

test('dwa dni na danie podwajaja zapotrzebowanie w planie', () => {
  const base = { people: 4, excludedTags: [], pantry: [], pinnedRecipeIds: ['spaghetti-bolognese'] };
  const oneDay = createPlan({ ...base, daysWithDinner: 2, daysPerDish: 1 }, SEED);
  const twoDays = createPlan({ ...base, daysWithDinner: 4, daysPerDish: 2 }, SEED);

  const spaghettiOne = oneDay.shoppingList.find((i) => i.product.id === 'spaghetti')!;
  const spaghettiTwo = twoDays.shoppingList.find((i) => i.product.id === 'spaghetti')!;

  assert.equal(oneDay.dishCount, 2);
  assert.equal(twoDays.dishCount, 2, 'te same 2 dania, ale kazde na dwa dni');
  assert.ok(
    spaghettiTwo.needed > spaghettiOne.needed,
    'na dwa dni trzeba wiecej makaronu niz na jeden',
  );
});

test('nadpisanie naIleDni przy jednym daniu przelicza liste, nie zmienia skladu', () => {
  const input = {
    people: 4,
    daysWithDinner: 4,
    daysPerDish: 1,
    excludedTags: [],
    pantry: [],
  };
  const plan = createPlan(input, SEED);
  const ids = plan.meals.map((m) => m.id);
  const target = ids[0]!;

  const stretched = planForMeals(
    { ...input, scalingByRecipe: { [target]: { daysCovered: 3 } } },
    SEED,
    ids,
  );

  assert.deepEqual(stretched.meals.map((m) => m.id), ids, 'sklad planu bez zmian');
  assert.ok(stretched.totalCost > plan.totalCost, 'trzeba kupic wiecej');
  assert.equal(stretched.daysCovered, 3 + 3 * 1, 'jedno danie na 3 dni, reszta po jednym');
});

// --- C2: liczba porcji przy pojedynczym daniu ------------------------------

test('nadpisanie liczby porcji przy jednym daniu dziala tak samo', () => {
  const input = {
    people: 4,
    daysWithDinner: 4,
    daysPerDish: 1,
    excludedTags: [],
    pantry: [],
  };
  const plan = createPlan(input, SEED);
  const ids = plan.meals.map((m) => m.id);
  const target = ids[0]!;

  const bigger = planForMeals(
    { ...input, scalingByRecipe: { [target]: { servings: 8 } } },
    SEED,
    ids,
  );

  assert.deepEqual(bigger.meals.map((m) => m.id), ids, 'sklad planu bez zmian');
  assert.ok(bigger.totalCost > plan.totalCost, 'osiem porcji kosztuje wiecej niz cztery');
});

test('plan raportuje ile dni faktycznie pokrywa', () => {
  const plan = createPlan(
    { people: 4, daysWithDinner: 6, daysPerDish: 2, excludedTags: [], pantry: [] },
    SEED,
  );
  assert.equal(plan.dishCount, 3);
  assert.equal(plan.daysCovered, 6, 'trzy dania po dwa dni pokrywaja szesc dni');
});

// --- C3: stale zakupy ------------------------------------------------------

const MILK_CATALOG: Catalog = {
  products: [
    product('mleko', { packSize: 1000, price: 4, perishable: true, unit: 'ml' }),
    product('kasza', { packSize: 400, price: 6, perishable: false, category: 'sypkie' }),
  ],
  recipes: [
    recipe('nalesniki', { ingredients: [{ productId: 'mleko', amount: 700 }] }),
    recipe('kaszotto', { ingredients: [{ productId: 'kasza', amount: 300 }] }),
  ],
};

const ONE_DISH = {
  people: 4,
  daysWithDinner: 1,
  daysPerDish: 1,
  excludedTags: [] as never[],
  pantry: [],
  pinnedRecipeIds: ['nalesniki'],
};

test('stale zakupy sumuja sie z przepisami PRZED policzeniem opakowan', () => {
  // Przepis chce 700 ml, na sniadania trzeba 1 karton. Razem 1700 ml,
  // czyli DWA kartony po 1000 ml, a nie jeden plus jeden liczone osobno.
  const plan = createPlan(
    { ...ONE_DISH, standingPurchases: [{ productId: 'mleko', quantity: 1 }] },
    MILK_CATALOG,
  );

  const milk = plan.shoppingList.find((i) => i.product.id === 'mleko')!;
  assert.equal(milk.needed, 1700, '700 z przepisu plus 1000 ze stalych zakupow');
  assert.equal(milk.packCount, 2);
  assert.equal(milk.leftover, 300, '2000 kupione minus 1700 potrzebne');
});

test('produkt w stalych zakupach i w przepisie daje jedno opakowanie, nie dwa', () => {
  // Przepis potrzebuje 700 ml, stale zakupy 200 ml. Razem 900 ml, wiec
  // jeden karton wystarcza. Liczone osobno wyszlyby dwa.
  const plan = createPlan(
    { ...ONE_DISH, standingPurchases: [{ productId: 'mleko', quantity: 0.2 }] },
    MILK_CATALOG,
  );

  const milk = plan.shoppingList.find((i) => i.product.id === 'mleko')!;
  assert.equal(milk.needed, 900);
  assert.equal(milk.packCount, 1, 'jeden karton na wszystko');
});

test('staly zakup produktu spoza przepisow trafia na liste', () => {
  const plan = createPlan(
    { ...ONE_DISH, standingPurchases: [{ productId: 'kasza', quantity: 1 }] },
    MILK_CATALOG,
  );

  const groats = plan.shoppingList.find((i) => i.product.id === 'kasza');
  assert.ok(groats, 'kasza musi byc na liscie, mimo ze zaden przepis w planie jej nie uzywa');
  assert.equal(groats.packCount, 1);
});

test('spizarnia odejmuje sie od SUMY przepisow i stalych zakupow', () => {
  const plan = createPlan(
    {
      ...ONE_DISH,
      pantry: [{ productId: 'mleko', amount: 700 }],
      standingPurchases: [{ productId: 'mleko', quantity: 1 }],
    },
    MILK_CATALOG,
  );

  const milk = plan.shoppingList.find((i) => i.product.id === 'mleko')!;
  assert.equal(milk.needed, 1700);
  assert.equal(milk.fromPantry, 700);
  assert.equal(milk.packCount, 1, 'brakuje 1000 ml, czyli dokladnie jeden karton');
  assert.equal(milk.leftover, 0);
});

test('stale zakupy w kategorii produktu, bez osobnej sekcji na liscie', () => {
  const plan = createPlan(
    { ...ONE_DISH, standingPurchases: [{ productId: 'kasza', quantity: 1 }] },
    MILK_CATALOG,
  );
  const groats = plan.shoppingList.find((i) => i.product.id === 'kasza')!;
  assert.equal(groats.product.category, 'sypkie', 'z punktu widzenia sklepu to zwykle zakupy');
});
