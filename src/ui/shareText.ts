import type { ShoppingListItem } from '../core/optimizer.ts';
import { CATEGORY_ORDER } from '../core/types.ts';
import { categoryLabel, obiady, osoby, shoppingLine, zlRound } from './format.ts';

/**
 * Lista zakupow jako czysty tekst do wyslania w komunikatorze.
 *
 * Bez markdown, bez tabel, bez emoji. Krotkie linie, bo to ma byc czytelne
 * na telefonie osoby, ktora akurat stoi w sklepie.
 *
 * Pozycje odhaczone jako kupione sa pomijane. Adnotacje o resztkach NIE sa
 * eksportowane, bo dla osoby robiacej zakupy nie maja zadnego znaczenia.
 *
 * Funkcja jest czysta: te same dane zawsze daja ten sam tekst.
 */
export function shoppingListText(
  items: ShoppingListItem[],
  options: { mealCount: number; people: number; totalCost: number; bought?: string[] },
): string {
  const bought = new Set(options.bought ?? []);
  const remaining = items.filter((item) => !bought.has(item.product.id));

  const lines: string[] = [
    'Zakupy na tydzień',
    `${options.mealCount} ${obiady(options.mealCount)}, ${options.people} ${osoby(options.people)}`,
  ];

  if (remaining.length === 0) {
    lines.push('', 'Wszystko już kupione.');
    return lines.join('\n');
  }

  // Kolejnosc kategorii ta sama co na ekranie, czyli kolejnosc obchodzenia sklepu.
  const groups = new Map<string, ShoppingListItem[]>();
  for (const item of remaining) {
    const bucket = groups.get(item.product.category);
    if (bucket) bucket.push(item);
    else groups.set(item.product.category, [item]);
  }

  const ordered = [...groups].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a[0] as (typeof CATEGORY_ORDER)[number]) -
      CATEGORY_ORDER.indexOf(b[0] as (typeof CATEGORY_ORDER)[number]),
  );

  for (const [category, group] of ordered) {
    lines.push('', categoryLabel(category as (typeof CATEGORY_ORDER)[number]));
    for (const item of group) {
      lines.push(`- ${shoppingLine(item)}`);
    }
  }

  const cost = remaining.reduce((sum, item) => sum + item.itemCost, 0);
  lines.push('', `Razem około ${zlRound(bought.size > 0 ? cost : options.totalCost)}`);

  return lines.join('\n');
}
