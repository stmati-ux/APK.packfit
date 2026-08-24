/**
 * Eksport produktow do CSV, do sprawdzenia gramatur w sklepie.
 *
 * Niezweryfikowane ida na gore, bo to one wymagaja pracy.
 * Uruchom: npm run eksport
 */
import { writeFileSync } from 'node:fs';

import { CATEGORY_ORDER } from '../src/core/types.ts';
import { SEED_PRODUCTS } from '../src/data/seed/index.ts';

const OUT = 'produkty.csv';

/** Srednik i BOM, zeby Excel po polsku otworzyl plik poprawnie. */
const SEPARATOR = ';';
const BOM = '﻿';

function cell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value).replace(',', '.');
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const sorted = [...SEED_PRODUCTS].sort((a, b) => {
  // 1. niezweryfikowane na gorze
  if (a.verified !== b.verified) return a.verified ? 1 : -1;
  // 2. kolejnosc obchodzenia sklepu
  const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  // 3. alfabetycznie
  return a.name.localeCompare(b.name, 'pl');
});

const header = [
  'nazwa',
  'kategoria',
  'rozmiar opakowania',
  'jednostka',
  'cena',
  'zweryfikowane',
];

const rows = sorted.map((product) =>
  [
    cell(product.name),
    cell(product.category),
    cell(product.soldAs === 'luz' ? 'na wagę' : product.packSize),
    cell(product.unit),
    cell(product.price.toFixed(2)),
    cell(product.verified ? 'tak' : 'nie'),
  ].join(SEPARATOR),
);

writeFileSync(OUT, BOM + [header.join(SEPARATOR), ...rows].join('\r\n') + '\r\n', 'utf8');

const pending = sorted.filter((p) => !p.verified).length;
console.log(`Zapisano ${OUT}`);
console.log(`  produktow razem:      ${sorted.length}`);
console.log(`  do sprawdzenia:       ${pending}`);
console.log(`  juz zweryfikowanych:  ${sorted.length - pending}`);
