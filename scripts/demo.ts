/**
 * Skrypt kontrolny ze specyfikacji: 4 osoby, 5 posilkow, dwa warianty.
 *
 *   1. pusta spizarnia
 *   2. spizarnia z 200 g smietany i pol peczka natki (15 g)
 *
 * Chodzi o sprawdzenie, czy plan faktycznie zmienia sie tak, zeby te resztki
 * zuzyc, zanim ruszy interfejs.
 *
 * Uruchom: npm run demo
 */
import type { Catalog, PantryEntry } from '../src/core/types.ts';
import { createPlan, type PlanResult } from '../src/core/optimizer.ts';
import { SEED_PRODUCTS, SEED_RECIPES } from '../src/data/seed/index.ts';

const CATALOG: Catalog = { products: SEED_PRODUCTS, recipes: SEED_RECIPES };
const PEOPLE = 4;
const MEALS = 5;

const zl = (value: number) => `${value.toFixed(2).replace('.', ',')} zł`;

function amount(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded).replace('.', ',')} ${unit}`;
}

function show(title: string, pantry: PantryEntry[]): PlanResult {
  const started = performance.now();
  const plan = createPlan({ people: PEOPLE, daysWithDinner: MEALS, daysPerDish: 1, excludedTags: [], pantry }, CATALOG);
  const elapsed = performance.now() - started;

  console.log('');
  console.log('='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));

  if (pantry.length === 0) {
    console.log('Spiżarnia: pusta');
  } else {
    console.log('Spiżarnia:');
    for (const entry of pantry) {
      const product = SEED_PRODUCTS.find((p) => p.id === entry.productId)!;
      console.log(`  ${product.name}: ${amount(entry.amount, product.unit)}`);
    }
  }

  console.log('');
  console.log('PLAN TYGODNIA');
  for (const meal of plan.meals) {
    console.log(`  ${meal.name}  (${meal.timeMinutes} min)`);
  }

  console.log('');
  console.log('LISTA ZAKUPÓW');
  let category = '';
  for (const item of plan.shoppingList) {
    if (item.product.category !== category) {
      category = item.product.category;
      console.log(`  ${category.toUpperCase()}`);
    }

    const line =
      item.product.soldAs === 'luz'
        ? `${item.product.name}, ${amount(item.needed - item.fromPantry, item.unit)}`
        : `${item.product.name}, ${item.packCount} opak. ${amount(item.packSize ?? 0, item.unit)}`;

    const notes: string[] = [];
    if (item.fromPantry > 0) notes.push(`ze spiżarni ${amount(item.fromPantry, item.unit)}`);
    if (item.leftover > 0) notes.push(`zostanie ${amount(item.leftover, item.unit)}`);

    const suffix = notes.length > 0 ? `   (${notes.join(', ')})` : '';
    console.log(`    ${line.padEnd(48)} ${zl(item.itemCost).padStart(9)}${suffix}`);
  }

  console.log('');
  console.log(`  Koszt zakupów:                ${zl(plan.totalCost)}`);
  console.log(`  Zmarnuje się:                 ${zl(plan.leftoverValue)}`);
  console.log(`  Przy zakupach na oko:         ${zl(plan.averagePlanLeftoverValue)}`);
  console.log(`  OSZCZĘDNOŚĆ:                  ${zl(plan.savings)}`);
  console.log(
    `  (${plan.combinationsChecked.toLocaleString('pl-PL')} kombinacji w ${elapsed.toFixed(0)} ms)`,
  );

  return plan;
}

const empty = show('WARIANT 1 — PUSTA SPIŻARNIA', []);

const stocked = show('WARIANT 2 — 200 g ŚMIETANY I PÓŁ PĘCZKA NATKI', [
  { productId: 'smietana-18', amount: 200 },
  { productId: 'natka', amount: 15 },
]);

// --- czy plan faktycznie sprzata po poprzednim tygodniu? -------------------

console.log('');
console.log('='.repeat(78));
console.log('CZY ZAPASY ZMIENIŁY PLAN?');
console.log('='.repeat(78));

const emptyIds = empty.meals.map((m) => m.id);
const stockedIds = stocked.meals.map((m) => m.id);
const changed = stockedIds.filter((id) => !emptyIds.includes(id));

console.log('');
console.log(`  Dania wspólne dla obu wariantów: ${stockedIds.filter((id) => emptyIds.includes(id)).length} z ${MEALS}`);

if (changed.length === 0) {
  console.log('  Plan się NIE zmienił.');
} else {
  console.log('  Dania, które weszły dopiero przy pełnej spiżarni:');
  for (const id of changed) {
    const recipe = SEED_RECIPES.find((r) => r.id === id)!;
    const uses = recipe.ingredients
      .filter((i) => i.productId === 'smietana-18' || i.productId === 'natka')
      .map((i) => `${SEED_PRODUCTS.find((p) => p.id === i.productId)!.name} ${i.amount} g`);
    console.log(`    ${recipe.name}${uses.length > 0 ? `  <-- używa: ${uses.join(', ')}` : ''}`);
  }
}

/**
 * Uwaga: produkt w pelni pokryty ze spizarni NIE trafia na liste zakupow,
 * wiec zapasu nie wolno szukac po liscie zakupow. Liczymy zapotrzebowanie
 * wprost z wybranych dan.
 */
function requiredBy(plan: PlanResult, productId: string): number {
  let total = 0;
  for (const meal of plan.meals) {
    for (const ing of meal.ingredients) {
      if (ing.productId === productId) {
        total += ing.amount * (PEOPLE / meal.baseServings);
      }
    }
  }
  return Math.round(total * 100) / 100;
}

console.log('');
console.log('  Co się stało z zapasami:');

for (const [productId, stock] of [
  ['smietana-18', 200],
  ['natka', 15],
] as const) {
  const product = SEED_PRODUCTS.find((p) => p.id === productId)!;
  const required = requiredBy(stocked, productId);
  const used = Math.min(stock, required);
  const listed = stocked.shoppingList.find((i) => i.product.id === productId);

  const verdict =
    required === 0
      ? 'plan w ogóle go nie potrzebuje'
      : used >= stock
        ? `ZUŻYTY W CAŁOŚCI (plan potrzebuje ${amount(required, product.unit)})`
        : `zużyte ${amount(used, product.unit)} z ${amount(stock, product.unit)}`;

  const buying = listed ? `, dokupujemy ${listed.packCount} opak.` : ', nic nie dokupujemy';
  console.log(`    ${product.name.padEnd(28)} ${verdict}${required > 0 ? buying : ''}`);
}
console.log('');
