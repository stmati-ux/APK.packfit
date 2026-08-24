/**
 * Walidacja zalozenia produktowego.
 *
 * Pytanie: czy optymalizator faktycznie bije losowy dobor dan, czy tylko
 * nam sie tak wydaje?
 *
 * Skrypt NIE jest czescia aplikacji. Uruchom: npm run walidacja
 *
 * Zasada: nie wygladzamy wyniku i nie dobieramy konfiguracji tak, zeby wyszlo
 * korzystnie. Ziarno generatora jest stale, wiec wynik da sie powtorzyc.
 */
import type { Catalog, DietTag, PantryEntry, Product } from '../src/core/types.ts';
import { PlanError, createPlan, planForMeals } from '../src/core/optimizer.ts';
import { SEED_PRODUCTS, SEED_RECIPES } from '../src/data/seed/index.ts';

const CATALOG: Catalog = { products: SEED_PRODUCTS, recipes: SEED_RECIPES };

const CONFIGS = 200;
const RANDOM_PLANS_PER_CONFIG = 50;
const SEED = 20260821;

const ALL_TAGS: DietTag[] = [
  'wieprzowina', 'wolowina', 'drob', 'ryba', 'laktoza', 'gluten', 'orzechy', 'jajka',
];

// --- deterministyczny generator -------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function sample<T>(list: readonly T[], count: number): T[] {
  const pool = [...list];
  for (let i = 0; i < count && i < pool.length; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}

// --- statystyka -----------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (index - lo);
}

const median = (values: number[]) => percentile([...values].sort((a, b) => a - b), 0.5);
const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;

interface Stats {
  median: number;
  mean: number;
  p25: number;
  p75: number;
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 0.5),
    mean: mean(values),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
}

const zl = (v: number) => `${v.toFixed(2).replace('.', ',')} zł`;
const pad = (s: string, n: number) => s.padStart(n);

// --- losowa konfiguracja --------------------------------------------------

const PERISHABLE = SEED_PRODUCTS.filter((p) => p.perishable && p.soldAs === 'opakowanie');

interface Config {
  people: number;
  days: number;
  excludedTags: DietTag[];
  pantry: PantryEntry[];
  pantryLabel: string;
}

function randomConfig(): Config {
  const people = between(1, 5);
  const days = between(3, 7);

  // Losowy podzbior wykluczen, czesto pusty, bo tak wyglada realne uzycie.
  const tagCount = between(0, 3);
  const excludedTags = sample(ALL_TAGS, tagCount);

  // Polowa przypadkow z pusta spizarnia, polowa z resztkami po poprzednim tygodniu.
  const withPantry = rng() < 0.5;
  const products: Product[] = withPantry ? sample(PERISHABLE, between(2, 4)) : [];
  const pantry: PantryEntry[] = products.map((product) => ({
    productId: product.id,
    // Resztka: od 30 do 90 procent opakowania.
    amount: Math.round((product.packSize ?? 100) * (0.3 + rng() * 0.6)),
  }));

  return {
    people,
    days,
    excludedTags,
    pantry,
    pantryLabel: withPantry ? products.map((p) => p.name).join(', ') : 'pusta',
  };
}

// --- pomiar ---------------------------------------------------------------

interface Measurement {
  config: Config;
  optimizerWaste: number;
  optimizerCost: number;
  randomWastes: number[];
  randomCosts: number[];
  randomMedian: number;
  randomCostMedian: number;
  /** Dodatnia wartosc oznacza, ze optymalizator zmarnowal MNIEJ. */
  advantage: number;
  /** Dodatnia wartosc oznacza, ze optymalizator kazal wydac WIECEJ. */
  extraCost: number;
  /**
   * Bilans netto: ile realnie zyskuje domowy budzet.
   * Oszczednosc na wyrzuconym jedzeniu minus dodatkowy koszt zakupow.
   */
  net: number;
}

function measure(config: Config): Measurement | null {
  const input = {
    people: config.people,
    daysWithDinner: config.days,
    daysPerDish: 1,
    excludedTags: config.excludedTags,
    pantry: config.pantry,
  };

  let optimizer;
  try {
    optimizer = createPlan(input, CATALOG);
  } catch (err) {
    if (err instanceof PlanError) return null;
    throw err;
  }

  const mealCount = optimizer.meals.length;
  const excluded = new Set(config.excludedTags);
  const pool = CATALOG.recipes.filter((r) => !r.tags.some((t) => excluded.has(t)));

  const randomWastes: number[] = [];
  const randomCosts: number[] = [];
  for (let i = 0; i < RANDOM_PLANS_PER_CONFIG; i++) {
    const ids = sample(pool, mealCount).map((r) => r.id);
    // Ten sam rachunek co dla planu optymalizatora, tylko sklad dan losowy.
    const plan = planForMeals(input, CATALOG, ids);
    randomWastes.push(plan.leftoverValue);
    randomCosts.push(plan.totalCost);
  }

  const randomMed = median(randomWastes);
  const randomCostMed = median(randomCosts);
  const advantage = randomMed - optimizer.leftoverValue;
  const extraCost = optimizer.totalCost - randomCostMed;

  return {
    config,
    optimizerWaste: optimizer.leftoverValue,
    optimizerCost: optimizer.totalCost,
    randomWastes,
    randomCosts,
    randomMedian: randomMed,
    randomCostMedian: randomCostMed,
    advantage,
    extraCost,
    net: advantage - extraCost,
  };
}

// --- przebieg -------------------------------------------------------------

console.log('');
console.log('='.repeat(78));
console.log('WALIDACJA: OPTYMALIZATOR KONTRA LOSOWY DOBOR DAN');
console.log('='.repeat(78));
console.log(`Konfiguracji: ${CONFIGS}   losowych planow na konfiguracje: ${RANDOM_PLANS_PER_CONFIG}`);
console.log(`Baza: ${SEED_RECIPES.length} przepisow, ${SEED_PRODUCTS.length} produktow`);
console.log(`Ziarno generatora: ${SEED} (wynik jest powtarzalny)`);

const started = Date.now();
const results: Measurement[] = [];
let skipped = 0;

for (let i = 0; i < CONFIGS; i++) {
  const measurement = measure(randomConfig());
  if (measurement === null) {
    skipped++;
    continue;
  }
  results.push(measurement);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

const optimizerStats = stats(results.map((r) => r.optimizerWaste));
const randomStats = stats(results.flatMap((r) => r.randomWastes));
const randomMedianStats = stats(results.map((r) => r.randomMedian));

const diffs = results.map((r) => r.advantage);
const relativeDiffs = results
  .filter((r) => r.randomMedian > 0.01)
  .map((r) => (r.advantage / r.randomMedian) * 100);

const worseThanRandom = results.filter((r) => r.advantage < 0).length;
const tied = results.filter((r) => Math.abs(r.advantage) <= 0.01).length;

console.log('');
console.log(`Policzone: ${results.length}, pominiete (za malo przepisow po wykluczeniach): ${skipped}`);
console.log(`Czas: ${elapsed} s`);

console.log('');
console.log('WARTOSC STRAT (produkty psujace sie)');
console.log('');
console.log('                          mediana      srednia          p25          p75');
console.log(
  `  optymalizator   ${pad(zl(optimizerStats.median), 12)} ${pad(zl(optimizerStats.mean), 12)} ` +
    `${pad(zl(optimizerStats.p25), 12)} ${pad(zl(optimizerStats.p75), 12)}`,
);
console.log(
  `  losowy plan     ${pad(zl(randomStats.median), 12)} ${pad(zl(randomStats.mean), 12)} ` +
    `${pad(zl(randomStats.p25), 12)} ${pad(zl(randomStats.p75), 12)}`,
);
console.log(
  `  mediana losowa  ${pad(zl(randomMedianStats.median), 12)} ${pad(zl(randomMedianStats.mean), 12)} ` +
    `${pad(zl(randomMedianStats.p25), 12)} ${pad(zl(randomMedianStats.p75), 12)}`,
);

console.log('');
console.log('PRZEWAGA OPTYMALIZATORA (dodatnia = marnuje mniej)');
console.log('');
console.log(`  mediana roznicy:            ${zl(median(diffs))}`);
console.log(`  srednia roznicy:            ${zl(mean(diffs))}`);
console.log(
  `  mediana roznicy wzglednej:  ${median(relativeDiffs).toFixed(1).replace('.', ',')} %`,
);
console.log(
  `  gorzej od mediany losowej:  ${worseThanRandom} z ${results.length} ` +
    `(${((worseThanRandom / results.length) * 100).toFixed(1).replace('.', ',')} %)`,
);
console.log(`  remis (do 1 grosza):        ${tied} z ${results.length}`);

// --- strona kosztowa: bez niej powyzsze liczby nic nie znacza -------------

const costOpt = stats(results.map((r) => r.optimizerCost));
const costRnd = stats(results.map((r) => r.randomCostMedian));
const extras = results.map((r) => r.extraCost);
const nets = results.map((r) => r.net);
const netNegative = results.filter((r) => r.net < 0).length;

console.log('');
console.log('KOSZT ZAKUPOW');
console.log('');
console.log('                          mediana      srednia          p25          p75');
console.log(
  `  optymalizator   ${pad(zl(costOpt.median), 12)} ${pad(zl(costOpt.mean), 12)} ` +
    `${pad(zl(costOpt.p25), 12)} ${pad(zl(costOpt.p75), 12)}`,
);
console.log(
  `  mediana losowa  ${pad(zl(costRnd.median), 12)} ${pad(zl(costRnd.mean), 12)} ` +
    `${pad(zl(costRnd.p25), 12)} ${pad(zl(costRnd.p75), 12)}`,
);
console.log('');
console.log(`  mediana doplaty za optymalizacje: ${zl(median(extras))}`);

console.log('');
console.log('BILANS NETTO DLA DOMOWEGO BUDZETU');
console.log('  (mniej wyrzuconego jedzenia minus wyzszy rachunek za zakupy)');
console.log('');
console.log(`  mediana:                    ${zl(median(nets))}`);
console.log(`  srednia:                    ${zl(mean(nets))}`);
console.log(
  `  na minusie:                 ${netNegative} z ${results.length} ` +
    `(${((netNegative / results.length) * 100).toFixed(1).replace('.', ',')} %)`,
);

console.log('');
console.log('PIEC NAJGORSZYCH PRZYPADKOW (wg bilansu netto)');
console.log('');

const worst = [...results].sort((a, b) => a.net - b.net).slice(0, 5);
for (const [index, item] of worst.entries()) {
  const c = item.config;
  console.log(
    `  ${index + 1}. ${c.people} os., ${c.days} dan, wykluczenia: ` +
      `${c.excludedTags.length > 0 ? c.excludedTags.join(', ') : 'brak'}`,
  );
  console.log(`     spizarnia: ${c.pantryLabel}`);
  console.log(
    `     straty: optymalizator ${zl(item.optimizerWaste)} kontra losowe ${zl(item.randomMedian)}, ` +
      `mniej o ${zl(item.advantage)}`,
  );
  console.log(
    `     koszt:  optymalizator ${zl(item.optimizerCost)} kontra losowe ${zl(item.randomCostMedian)}, ` +
      `doplata ${zl(item.extraCost)}`,
  );
  console.log(`     BILANS NETTO: ${zl(item.net)}`);
}

console.log('');
console.log('='.repeat(78));
// Werdykt patrzy na BILANS NETTO, nie na same straty. Zmniejszenie strat
// okupione wyzszym rachunkiem nie jest korzyscia dla uzytkownika.
const netMedian = median(nets);
const verdict =
  netMedian > 5 && netNegative / results.length < 0.25
    ? 'ZALOZENIE SIE BRONI'
    : netMedian > 0
      ? 'ZALOZENIE SIE BRONI SLABO'
      : 'ZALOZENIE SIE NIE BRONI';
console.log(`WERDYKT: ${verdict}`);
console.log('='.repeat(78));
console.log('');
