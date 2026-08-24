/**
 * Tokeny wygladu, zdjete z projektu graficznego.
 * Jedyny akcent to ciemna zielen, reszta to biel i typografia.
 */

export const colors = {
  background: '#FFFFFF',
  backdrop: '#F4F4F1',
  surface: '#FFFFFF',

  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  /** Nagłówki sekcji i adnotacje typu "zostanie 40 g". */
  textFaint: '#9A9A9A',
  textDone: '#A5A5A5',

  accent: '#2D5A3D',
  accentText: '#FFFFFF',

  /**
   * Bursztyn. Pojawia sie WYLACZNIE przy statusie skladnika "prawie".
   * Status "brak" zostaje neutralny i nigdy nie jest czerwony.
   * Aplikacja informuje, nie alarmuje.
   */
  warning: '#B45309',

  border: '#E6E6E2',
  borderStrong: '#D2D2CC',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  pill: 999,
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: '600' },
  subtitle: { fontSize: 14, fontWeight: '400' },
  /** WARZYWA, NABIAŁ, SKŁADNIKI. */
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  body: { fontSize: 16, fontWeight: '400' },
  bodyStrong: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 13, fontWeight: '400' },
  note: { fontSize: 12, fontWeight: '400' },
  /** Wielkie liczby na podsumowaniu. */
  hero: { fontSize: 34, fontWeight: '700' },
} as const;
