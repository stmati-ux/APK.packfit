import type { Product, Recipe } from '../../core/types.ts';
import productsData from './products.json' with { type: 'json' };
import recipesData from './recipes.json' with { type: 'json' };

/**
 * Dane startowe. Gramatury opakowan i ceny siedza w plikach JSON, NIE w kodzie.
 * To najwazniejszy zasob w projekcie i musi byc edytowalny bez dotykania logiki.
 *
 * To jest tylko punkt startowy. Zywy katalog sklada dopiero src/data/store.ts:
 * seed + wlasne produkty uzytkownika + jego poprawki cen.
 *
 * Uwaga dla Metro/Expo: gdyby bundler nie strawil skladni `with { type: 'json' }`,
 * podmiana na zwykly `import productsData from './products.json'` to jedyna
 * potrzebna zmiana i tylko w tym pliku.
 */
export const SEED_PRODUCTS = productsData as Product[];
export const SEED_RECIPES = recipesData as Recipe[];
