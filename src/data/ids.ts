/**
 * UUID generowany po stronie klienta, nigdy autoinkrementowane id.
 * Dzieki temu dolozenie kont Supabase nie wymaga migracji danych.
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  // Zapas dla srodowisk bez Web Crypto (starsze Android WebView).
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { out += '-'; continue; }
    if (i === 14) { out += '4'; continue; }
    const r = Math.floor(Math.random() * 16);
    out += (i === 19 ? (r & 0x3) | 0x8 : r).toString(16);
  }
  return out;
}
