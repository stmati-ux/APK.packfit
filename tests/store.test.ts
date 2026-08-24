import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  StoreError,
  createLocalStore,
  createMemoryAdapter,
  type NewProductInput,
} from '../src/data/store.ts';
import { SEED_PRODUCTS } from '../src/data/seed/index.ts';

const fresh = () => createLocalStore(createMemoryAdapter());

const OSCYPEK: NewProductInput = {
  name: 'Oscypek',
  category: 'nabial',
  unit: 'g',
  soldAs: 'opakowanie',
  packSize: 300,
  price: 24.99,
  perishable: true,
  verified: false,
};

// --- dane nie sa zaszyte w kodzie -----------------------------------------

test('katalog startowy idzie z plikow JSON, nie ze stalych w kodzie', async () => {
  const store = fresh();
  const products = await store.getProducts();
  assert.equal(products.length, SEED_PRODUCTS.length);
  assert.equal(products.length, SEED_PRODUCTS.length);
});

test('kazdy produkt z seeda ma sensowna gramature i cene', async () => {
  const store = fresh();
  for (const product of await store.getProducts()) {
    assert.ok(product.price >= 0, `${product.name} ma ujemna cene`);
    if (product.soldAs === 'opakowanie') {
      assert.ok((product.packSize ?? 0) > 0, `${product.name} nie ma gramatury`);
    } else {
      assert.equal(product.packSize, null, `${product.name} jest na wage, ale ma gramature`);
    }
  }
});

// --- reczne dopisanie produktu --------------------------------------------

test('mozna recznie dopisac wlasny produkt', async () => {
  const store = fresh();
  const added = await store.addCustomProduct(OSCYPEK);

  assert.equal(added.name, 'Oscypek');
  assert.equal(added.userId, null, 'userId nullowalne od poczatku');
  assert.match(added.id, /^[0-9a-f-]{36}$/, 'uuid generowany po stronie klienta');

  const products = await store.getProducts();
  assert.equal(products.length, SEED_PRODUCTS.length + 1);
  assert.ok(products.some((p) => p.id === added.id));
});

test('wlasny produkt przezywa ponowne wczytanie katalogu', async () => {
  const adapter = createMemoryAdapter();
  const added = await createLocalStore(adapter).addCustomProduct(OSCYPEK);

  const reopened = createLocalStore(adapter);
  const products = await reopened.getProducts();
  assert.ok(products.some((p) => p.id === added.id));
});

test('wlasny produkt daje sie usunac', async () => {
  const store = fresh();
  const added = await store.addCustomProduct(OSCYPEK);
  await store.removeCustomProduct(added.id);

  assert.equal((await store.getProducts()).length, SEED_PRODUCTS.length);
  assert.equal((await store.getCustomProducts()).length, 0);
});

test('nie da sie usunac produktu z seeda', async () => {
  const store = fresh();
  await assert.rejects(
    () => store.removeCustomProduct('smietana-18'),
    (err: unknown) => err instanceof StoreError && err.code === 'NOT_CUSTOM_PRODUCT',
  );
});

// --- walidacja ------------------------------------------------------------

test('odrzuca produkt bez nazwy', async () => {
  const store = fresh();
  await assert.rejects(
    () => store.addCustomProduct({ ...OSCYPEK, name: '   ' }),
    (err: unknown) => err instanceof StoreError && err.code === 'INVALID_PRODUCT',
  );
});

test('odrzuca ujemna cene', async () => {
  const store = fresh();
  await assert.rejects(
    () => store.addCustomProduct({ ...OSCYPEK, price: -1 }),
    (err: unknown) => err instanceof StoreError && err.code === 'INVALID_PRODUCT',
  );
});

test('odrzuca opakowanie bez gramatury', async () => {
  const store = fresh();
  await assert.rejects(
    () => store.addCustomProduct({ ...OSCYPEK, packSize: null }),
    (err: unknown) => err instanceof StoreError && err.code === 'INVALID_PRODUCT',
  );
});

test('odrzuca produkt na wage z gramatura opakowania', async () => {
  const store = fresh();
  await assert.rejects(
    () => store.addCustomProduct({ ...OSCYPEK, soldAs: 'luz', packSize: 300 }),
    (err: unknown) => err instanceof StoreError && err.code === 'INVALID_PRODUCT',
  );
});

test('przyjmuje produkt na wage bez gramatury', async () => {
  const store = fresh();
  const added = await store.addCustomProduct({
    ...OSCYPEK,
    name: 'Bataty',
    category: 'warzywa',
    soldAs: 'luz',
    packSize: null,
    price: 8.99,
  });
  assert.equal(added.packSize, null);
});

// --- ceny i gramatury jako edytowalny parametr ----------------------------

test('cena jest edytowalna i nadpisuje seed', async () => {
  const store = fresh();
  const before = (await store.getProducts()).find((p) => p.id === 'smietana-18')!;
  assert.equal(before.price, 5.29);

  await store.setProductPrice('smietana-18', 7.49);

  const after = (await store.getProducts()).find((p) => p.id === 'smietana-18')!;
  assert.equal(after.price, 7.49);
});

test('gramatura opakowania jest edytowalna', async () => {
  const store = fresh();
  await store.setProductPackSize('smietana-18', 200);

  const product = (await store.getProducts()).find((p) => p.id === 'smietana-18')!;
  assert.equal(product.packSize, 200);
});

test('reset poprawek wraca do wartosci z seeda', async () => {
  const store = fresh();
  await store.setProductPrice('smietana-18', 99);
  await store.setProductPackSize('smietana-18', 123);
  await store.resetProductOverrides('smietana-18');

  const product = (await store.getProducts()).find((p) => p.id === 'smietana-18')!;
  assert.equal(product.price, 5.29);
  assert.equal(product.packSize, 400);
});

test('odrzuca bezsensowna cene i gramature', async () => {
  const store = fresh();
  await assert.rejects(() => store.setProductPrice('smietana-18', -5));
  await assert.rejects(() => store.setProductPackSize('smietana-18', 0));
});

// --- reszta magazynu ------------------------------------------------------

test('spizarnia, plan i ustawienia przezywaja zapis i odczyt', async () => {
  const adapter = createMemoryAdapter();
  const store = createLocalStore(adapter);

  await store.savePantry([
    { id: 'x', userId: null, productId: 'ryz', amount: 500, addedAt: '2026-08-21', source: 'zakupy' },
  ]);
  await store.saveSettings({ people: 2, daysWithDinner: 4, daysPerDish: 2, excludedTags: ['ryba'] });
  await store.savePlan({
    id: 'plan-1',
    userId: null,
    createdAt: '2026-08-21',
    people: 2,
    entries: [{ recipeId: 'spaghetti-bolognese', cooked: false, pinned: true, consumption: null, servings: 4, daysCovered: 1 }],
    boughtProductIds: [],
    skippedProductIds: ['sol'],
  });

  const reopened = createLocalStore(adapter);
  assert.equal((await reopened.getPantry()).length, 1);
  assert.equal((await reopened.getSettings()).people, 2);
  assert.deepEqual((await reopened.getPlan())?.skippedProductIds, ['sol']);
  assert.equal((await reopened.getPlan())?.entries[0]?.pinned, true, 'przypiecie przezywa zapis');
});

test('domyslne ustawienia to 4 osoby, 5 dni z obiadem, danie na 1 dzien', async () => {
  assert.deepEqual(await fresh().getSettings(), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.people, 4);
  assert.equal(DEFAULT_SETTINGS.daysWithDinner, 5);
  assert.equal(DEFAULT_SETTINGS.daysPerDish, 1);
});

test('usuniecie planu czysci wpis', async () => {
  const store = fresh();
  await store.savePlan({
    id: 'p',
    userId: null,
    createdAt: '2026-08-21',
    people: 4,
    entries: [{ recipeId: 'schabowy', cooked: false, pinned: false, consumption: null, servings: 4, daysCovered: 1 }],
    boughtProductIds: [],
    skippedProductIds: [],
  });
  await store.savePlan(null);
  assert.equal(await store.getPlan(), null);
});

test('uszkodzony wpis nie wywala aplikacji', async () => {
  const adapter = createMemoryAdapter();
  await adapter.setItem('zr.pantry.v1', '{to nie jest json');
  assert.deepEqual(await createLocalStore(adapter).getPantry(), []);
});
