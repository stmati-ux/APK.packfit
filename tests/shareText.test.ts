import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ShoppingListItem } from '../src/core/optimizer.ts';
import type { Category, Product, SoldAs } from '../src/core/types.ts';
import { shoppingListText } from '../src/ui/shareText.ts';

function item(
  id: string,
  name: string,
  category: Category,
  opts: { soldAs?: SoldAs; packSize?: number | null; packCount?: number; needed?: number; cost?: number } = {},
): ShoppingListItem {
  const product: Product = {
    id,
    name,
    category,
    unit: 'g',
    soldAs: opts.soldAs ?? 'opakowanie',
    packSize: opts.packSize ?? 400,
    price: 5,
    perishable: true,
    verified: false,
  };
  return {
    product,
    packCount: opts.packCount ?? 1,
    packSize: product.packSize,
    unit: 'g',
    needed: opts.needed ?? 300,
    fromPantry: 0,
    // Resztka celowo niezerowa: NIE moze pojawic sie w eksporcie.
    leftover: 100,
    itemCost: opts.cost ?? 5,
  };
}

const LIST: ShoppingListItem[] = [
  item('smietana', 'Śmietana 18%', 'nabial'),
  item('cebula', 'Cebula', 'warzywa', { soldAs: 'luz', packSize: null, packCount: 0, needed: 450 }),
  item('twarog', 'Twaróg', 'nabial', { packSize: 250 }),
  item('pieczarki', 'Pieczarki', 'warzywa'),
];

const OPTIONS = { mealCount: 5, people: 4, totalCost: 187 };

test('zachowuje kolejnosc kategorii, warzywa przed nabialem', () => {
  const out = shoppingListText(LIST, OPTIONS);
  assert.ok(out.indexOf('WARZYWA') < out.indexOf('NABIAŁ'), out);
});

test('naglowek zawiera liczbe obiadow i osob w poprawnej odmianie', () => {
  const out = shoppingListText(LIST, OPTIONS);
  assert.ok(out.startsWith('Zakupy na tydzień\n5 obiadów, 4 osoby'), out);
});

test('pozycje sa w opakowaniach, a luz bez slowa opak', () => {
  const out = shoppingListText(LIST, OPTIONS);
  assert.ok(out.includes('- Śmietana 18%, 1 opak. 400 g'), out);
  assert.ok(out.includes('- Cebula, 450 g'), out);
  assert.ok(!out.includes('Cebula, 1 opak.'), 'produkt na wage nie ma opakowania');
});

test('pomija pozycje odhaczone jako kupione', () => {
  const out = shoppingListText(LIST, { ...OPTIONS, bought: ['smietana', 'cebula'] });
  assert.ok(!out.includes('Śmietana'), out);
  assert.ok(!out.includes('Cebula'), out);
  assert.ok(out.includes('Twaróg'), out);
  assert.ok(out.includes('Pieczarki'), out);
});

test('nie eksportuje adnotacji o resztkach', () => {
  const out = shoppingListText(LIST, OPTIONS);
  assert.ok(!out.includes('zostanie'), 'resztki nie obchodza osoby robiacej zakupy');
});

test('czysty tekst: bez markdown, bez tabel, bez emoji', () => {
  const out = shoppingListText(LIST, OPTIONS);
  assert.ok(!/[*_#`|]/.test(out), 'zadnych znakow markdown ani tabel');
  assert.ok(!/\p{Extended_Pictographic}/u.test(out), 'zadnych emoji');
});

test('linie sa krotkie, czytelne w komunikatorze', () => {
  for (const line of shoppingListText(LIST, OPTIONS).split('\n')) {
    assert.ok(line.length <= 48, `za dluga linia: ${line}`);
  }
});

test('konczy sie suma', () => {
  assert.ok(shoppingListText(LIST, OPTIONS).endsWith('Razem około 187 zł'));
});

test('gdy wszystko odhaczone, mowi o tym wprost', () => {
  const out = shoppingListText(LIST, {
    ...OPTIONS,
    bought: LIST.map((i) => i.product.id),
  });
  assert.ok(out.includes('Wszystko już kupione.'), out);
});

test('pusta lista nie wywala funkcji', () => {
  const out = shoppingListText([], OPTIONS);
  assert.ok(out.includes('Wszystko już kupione.'));
});
