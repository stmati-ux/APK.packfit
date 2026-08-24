import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from './theme.ts';

/** Tlo ekranu z bezpiecznymi marginesami. Bez dzieci sluzy za stan wczytywania. */
export function Screen({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={[s.screen, style]} edges={['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function Scroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={s.titleBlock}>
      <Text style={s.title}>{children}</Text>
      {sub ? <Text style={s.subtitle}>{sub}</Text> : null}
    </View>
  );
}

/** WARZYWA, NABIAŁ, SKŁADNIKI. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={s.hint}>{children}</Text>;
}

export function Divider() {
  return <View style={s.divider} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <Text style={s.error}>{children}</Text>;
}

/** Wiersz listy z cienka kreska u dolu. */
export function Row({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[s.row, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? s.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 20,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <View style={s.stepper}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperControls}>
        <StepperButton label="−" disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Text style={s.stepperValue}>{value}</Text>
        <StepperButton label="+" disabled={value >= max} onPress={() => onChange(value + 1)} />
      </View>
    </View>
  );
}

function StepperButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'zwiększ' : 'zmniejsz'}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.stepperBtn, pressed && s.pressed, disabled && s.stepperBtnOff]}
    >
      <Text style={[s.stepperBtnText, disabled && s.stepperBtnTextOff]}>{label}</Text>
    </Pressable>
  );
}

/** Chip wykluczenia. Zaznaczony dostaje zielona obwodke. */
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [s.chip, active && s.chipOn, pressed && s.pressed]}
    >
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.primary, pressed && s.pressed, disabled && s.primaryOff, style]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.secondary, pressed && s.pressed, style]}
    >
      <Text style={s.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/** Karta z obramowaniem. Uzywana na liscie przepisow. */
export function Card({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  const content = <View style={s.card}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? s.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

/**
 * Miejsce na zdjecie dania.
 *
 * Zdjecie jest OZDOBNE. Gdy go nie ma albo nie uda sie zaladowac, zostaje
 * neutralne pole i nic sie nie psuje. Nigdy nie blokuje ekranu.
 */
export function RecipePhoto({
  source,
  variant = 'thumb',
}: {
  source: ImageSourcePropType | null;
  variant?: 'thumb' | 'banner';
}) {
  const [failed, setFailed] = useState(false);
  const box = variant === 'thumb' ? s.photoThumb : s.photoBanner;

  // Proporcje pilnuje kontener, a obraz wypelnia go w calosci. Ustawienie
  // aspectRatio wprost na Image nie jest niezawodne w react-native-web:
  // przegladarka bierze wtedy wlasne wymiary pliku i pasek rozjezdza sie
  // na pol ekranu.
  return (
    <View style={[box, s.photoBox]}>
      {source && !failed ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[s.photoPlate, variant === 'banner' && s.photoPlateBig]} />
      )}
    </View>
  );
}

/**
 * Plywajacy przycisk dodawania w prawym dolnym rogu, nad nawigacja.
 * Uzywany na liscie zakupow i w spizarni.
 */
export function Fab({ onPress, label = 'dodaj' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.fab, pressed && s.fabPressed]}
    >
      <Text style={s.fabPlus}>+</Text>
    </Pressable>
  );
}

/** Kwadratowy checkbox. Zaznaczony wypelnia sie na zielono. */
export function Checkbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [s.checkbox, checked && s.checkboxOn, pressed && s.pressed]}
    >
      {checked ? <Text style={s.checkboxMark}>✓</Text> : null}
    </Pressable>
  );
}

export type TabIconName = 'plan' | 'przepisy' | 'zakupy' | 'spizarnia' | 'podsumowanie';

/**
 * Ikona zakladki razem z podpisem, rysowana geometria, bez biblioteki ikon.
 *
 * Podpis renderujemy sami, a wbudowany wylaczamy przez tabBarShowLabel: false.
 * Kontener podpisu w react-navigation ma stala wysokosc i przycinal dolne
 * wydluzenia liter (y w "Zakupy", ż w "Spiżarnia").
 */
export function TabIcon({
  name,
  label,
  active,
}: {
  name: TabIconName;
  label: string;
  active: boolean;
}) {
  const tint = active ? colors.accent : colors.textFaint;
  const line: ViewStyle = { backgroundColor: tint };

  return (
    <View style={s.tabItem}>
      <View style={[s.icon, { borderColor: tint }]}>
        {name === 'plan' ? (
        <>
            <View style={[s.iconBar, line, { width: 12 }]} />
            <View style={[s.iconBar, line, { width: 8 }]} />
          </>
        ) : null}
        {name === 'przepisy' ? (
          <>
            <View style={[s.iconBar, line, { width: 11 }]} />
            <View style={[s.iconBar, line, { width: 11 }]} />
            <View style={[s.iconBar, line, { width: 11 }]} />
          </>
        ) : null}
        {name === 'zakupy' ? <View style={[s.iconHandle, { borderColor: tint }]} /> : null}
        {name === 'spizarnia' ? <View style={[s.iconLid, line]} /> : null}
        {name === 'podsumowanie' ? (
          <>
            <View style={[s.iconBar, line, { width: 10 }]} />
            <View style={[s.iconBar, line, { width: 10 }]} />
            <View style={[s.iconBar, line, { width: 6 }]} />
          </>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[s.tabLabel, { color: tint }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Trojkat ostrzegawczy przy statusie "prawie".
 *
 * Kontur robiony sztuczka z obramowaniem: pelny trojkat w kolorze, a na nim
 * mniejszy w kolorze tla. Bez biblioteki SVG, ktorej w projekcie nie ma.
 */
export function WarningTriangle({ size = 13 }: { size?: number }) {
  const height = Math.round(size * 0.88);
  const stroke = 1.5;

  return (
    <View style={[s.triangle, { width: size, height }]}>
      <View
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderBottomWidth: height,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: colors.warning,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: stroke,
          width: 0,
          height: 0,
          borderLeftWidth: size / 2 - stroke * 1.6,
          borderRightWidth: size / 2 - stroke * 1.6,
          borderBottomWidth: height - stroke * 2.4,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: colors.background,
        }}
      />
      <Text style={[s.triangleMark, { fontSize: size * 0.52, lineHeight: size * 0.6 }]}>!</Text>
    </View>
  );
}

/** Pinezka przy daniu przypietym. */
export function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <View style={[s.pin, { width: size, height: size }]}>
      <View style={[s.pinHead, { width: size, height: size * 0.42 }]} />
      <View style={[s.pinStem, { height: size * 0.5 }]} />
    </View>
  );
}

/** Przelacznik wlacz/wylacz. */
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [s.toggleRow, pressed && s.pressed]}
    >
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <View style={[s.toggleTrack, value && s.toggleTrackOn]}>
        <View style={[s.toggleKnob, value && s.toggleKnobOn]} />
      </View>
    </Pressable>
  );
}

export const text = {
  body: { ...type.body, color: colors.text } as TextStyle,
  bodyStrong: { ...type.bodyStrong, color: colors.text } as TextStyle,
  muted: { ...type.meta, color: colors.textMuted } as TextStyle,
  faint: { ...type.note, color: colors.textFaint } as TextStyle,
  done: { ...type.body, color: colors.textDone, textDecorationLine: 'line-through' } as TextStyle,
  hero: { ...type.hero, color: colors.text } as TextStyle,
  accent: { ...type.bodyStrong, color: colors.accent } as TextStyle,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  titleBlock: { paddingTop: spacing.lg, paddingBottom: spacing.lg },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.subtitle, color: colors.textMuted, marginTop: spacing.xs },

  sectionLabel: {
    ...type.sectionLabel,
    color: colors.textFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  hint: { ...type.note, color: colors.textFaint, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  empty: { ...type.body, color: colors.textFaint, paddingVertical: spacing.xl },
  error: { ...type.meta, color: '#A33', paddingVertical: spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  stepperLabel: { ...type.body, color: colors.text, flex: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepperValue: { ...type.bodyStrong, color: colors.text, minWidth: 24, textAlign: 'center' },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnOff: { borderColor: colors.border },
  stepperBtnText: { fontSize: 18, color: colors.text, lineHeight: 20 },
  stepperBtnTextOff: { color: colors.textFaint },

  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.accent },
  chipText: { ...type.meta, color: colors.textMuted },
  chipTextOn: { color: colors.accent, fontWeight: '500' },

  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { ...type.bodyStrong, color: colors.accentText },

  secondary: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  secondaryText: { ...type.bodyStrong, color: colors.text },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxMark: { color: colors.accentText, fontSize: 14, lineHeight: 16 },

  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 4, width: 68 },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Cien, zeby przycisk odklejal sie od listy pod nim.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabPressed: { opacity: 0.85 },
  fabPlus: { fontSize: 30, lineHeight: 34, color: colors.accentText },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },

  photoThumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.backdrop },
  photoBanner: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.backdrop,
  },
  photoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPlate: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  photoPlateBig: { width: 44, height: 44, borderRadius: 22 },

  triangle: { alignItems: 'center', justifyContent: 'flex-end' },
  triangleMark: { color: colors.warning, fontWeight: '700', marginBottom: -0.5 },

  pin: { alignItems: 'center', justifyContent: 'flex-start' },
  pinHead: { backgroundColor: colors.textMuted, borderRadius: 1.5 },
  pinStem: { width: 1.5, backgroundColor: colors.textMuted },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: { backgroundColor: colors.accent },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  tabLabel: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  icon: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  iconBar: { height: 1.5, borderRadius: 1 },
  iconHandle: {
    width: 10,
    height: 7,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    marginTop: -8,
  },
  iconLid: { width: 12, height: 2, borderRadius: 1, marginTop: -7 },
});
