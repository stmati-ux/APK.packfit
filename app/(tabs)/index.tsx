import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { DietTag } from '../../src/core/types.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import {
  Checkbox,
  Chip,
  Empty,
  ErrorNote,
  Hint,
  PinIcon,
  PrimaryButton,
  Row,
  Screen,
  Scroll,
  SectionLabel,
  Stepper,
  Title,
  text,
} from '../../src/ui/components.tsx';
import { dishCount } from '../../src/core/optimizer.ts';
import { dni, dan, osoby, pozycje, planMeta, zlRound } from '../../src/ui/format.ts';
import { colors, spacing, type } from '../../src/ui/theme.ts';

/**
 * Ekran 1 i 2 z makiety.
 *
 * Dopoki planu nie ma, zakladka "Plan" pokazuje konfiguracje.
 * Po ulozeniu przelacza sie na plan tygodnia.
 */

const TAGS: { tag: DietTag; label: string }[] = [
  { tag: 'wieprzowina', label: 'wieprzowina' },
  { tag: 'wolowina', label: 'wołowina' },
  { tag: 'drob', label: 'drób' },
  { tag: 'ryba', label: 'ryby' },
  { tag: 'laktoza', label: 'laktoza' },
  { tag: 'gluten', label: 'gluten' },
  { tag: 'orzechy', label: 'orzechy' },
  { tag: 'jajka', label: 'jajka' },
];

export default function PlanScreen() {
  const { ready, entries } = useApp();
  if (!ready) return <Screen />;
  return entries.length > 0 ? <WeekPlan /> : <Setup />;
}

function Setup() {
  const {
    settings, setPeople, setDaysWithDinner, setDaysPerDish, toggleTag,
    generatePlan, standing, busy, error,
  } = useApp();

  const dishes = dishCount(settings.daysWithDinner, settings.daysPerDish);

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title>Zaplanuj tydzień</Title>

          <Stepper label="Ile osób jecie?" value={settings.people} onChange={setPeople} max={12} />

          <Stepper
            label="Ile dni w tygodniu jecie obiad w domu?"
            value={settings.daysWithDinner}
            onChange={setDaysWithDinner}
            max={7}
          />
          <Hint>Podaj szczerze. Lepiej mniej niż optymistycznie.</Hint>

          <Stepper
            label="Na ile dni zwykle starcza jedno danie?"
            value={settings.daysPerDish}
            onChange={setDaysPerDish}
            max={3}
          />
          <Hint>
            {`Ugotujesz ${dishes} ${dan(dishes)} na ${settings.daysWithDinner} ${dni(
              settings.daysWithDinner,
            )}.`}
          </Hint>

          <SectionLabel>CZEGO NIE JECIE?</SectionLabel>
          <View style={s.chips}>
            {TAGS.map(({ tag, label }) => (
              <Chip
                key={tag}
                label={label}
                active={settings.excludedTags.includes(tag)}
                onPress={() => toggleTag(tag)}
              />
            ))}
          </View>

          <SectionLabel>STAŁE ZAKUPY</SectionLabel>
          <Text
            suppressHighlighting
            accessibilityRole="button"
            style={[text.accent, s.link]}
            onPress={() => router.push('/stale-zakupy')}
          >
            {standing.length === 0
              ? 'Dodaj rzeczy kupowane co tydzień'
              : `${standing.length} ${pozycje(standing.length)} co tydzień`}
          </Text>
          <Hint>
            Doliczą się do zakupów razem z przepisami, więc nie kupisz tego samego dwa razy.
          </Hint>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </Scroll>

        <View style={s.footer}>
          <PrimaryButton label="Ułóż plan" onPress={generatePlan} disabled={busy} />
        </View>
      </View>
    </Screen>
  );
}

function WeekPlan() {
  const {
    plan,
    entries,
    settings,
    replaceMeal,
    clearPlan,
    generatePlan,
    toggleCooked,
    togglePinned,
    setEntryDays,
    setEntryServings,
    recipeById,
    toast,
    dismissToast,
    error,
  } = useApp();

  const coveredDays = entries.reduce((sum, e) => sum + e.daysCovered, 0);

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title sub={planMeta(entries.length, settings.people)}>Twój tydzień</Title>

          {entries.map((entry) => {
            const recipe = recipeById(entry.recipeId);
            if (!recipe) return null;

            return (
              <Row key={entry.recipeId}>
                <Checkbox
                  checked={entry.cooked}
                  onPress={() => toggleCooked(entry.recipeId)}
                />

                <View style={s.grow}>
                  <Text
                    suppressHighlighting
                    style={entry.cooked ? text.done : text.body}
                    onPress={() =>
                      entry.cooked
                        ? router.push({ pathname: '/korekta/[id]', params: { id: entry.recipeId } })
                        : router.push({ pathname: '/przepis/[id]', params: { id: entry.recipeId } })
                    }
                  >
                    {recipe.name}
                  </Text>
                  <View style={s.metaRow}>
                    <Text style={text.muted}>{recipe.timeMinutes} min</Text>
                    {entry.pinned ? (
                      <View style={s.pinTag}>
                        <PinIcon />
                        <Text style={text.faint}>przypięte</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={s.tweaks}>
                    <MiniStepper
                      label={`na ${entry.daysCovered} ${dni(entry.daysCovered)}`}
                      onLess={() => setEntryDays(entry.recipeId, entry.daysCovered - 1)}
                      onMore={() => setEntryDays(entry.recipeId, entry.daysCovered + 1)}
                      lessOff={entry.daysCovered <= 1}
                      moreOff={entry.daysCovered >= 3}
                    />
                    <MiniStepper
                      label={`${entry.servings} ${osoby(entry.servings)}`}
                      onLess={() => setEntryServings(entry.recipeId, entry.servings - 1)}
                      onMore={() => setEntryServings(entry.recipeId, entry.servings + 1)}
                      lessOff={entry.servings <= 1}
                      moreOff={entry.servings >= 12}
                    />
                  </View>
                </View>

                {entry.pinned ? (
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    style={text.muted}
                    onPress={() => togglePinned(entry.recipeId)}
                  >
                    Odepnij
                  </Text>
                ) : (
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    style={entry.cooked ? text.faint : text.accent}
                    onPress={() => (entry.cooked ? undefined : replaceMeal(entry.recipeId))}
                  >
                    Wymień
                  </Text>
                )}
              </Row>
            );
          })}

          {entries.length === 0 ? <Empty>Plan jest pusty.</Empty> : null}

          {coveredDays !== settings.daysWithDinner ? (
            <Text style={[text.muted, s.coverage]}>
              {`Plan pokrywa ${coveredDays} z ${settings.daysWithDinner} ${dni(
                settings.daysWithDinner,
              )}.`}
            </Text>
          ) : null}
          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <View style={s.actions}>
            <Text
              suppressHighlighting
              style={[text.muted, s.link]}
              accessibilityRole="button"
              onPress={generatePlan}
            >
              Ułóż od nowa, zachowaj przypięte
            </Text>
            <Text
              suppressHighlighting
              style={[text.muted, s.link]}
              accessibilityRole="button"
              onPress={clearPlan}
            >
              Wyczyść plan
            </Text>
          </View>
        </Scroll>

        {toast ? (
          <View style={s.toast}>
            <Text style={[text.body, s.toastText]}>{toast.text}</Text>
            <Text
              suppressHighlighting
              accessibilityRole="button"
              style={s.toastAction}
              onPress={() => {
                dismissToast();
                router.push({ pathname: '/korekta/[id]', params: { id: toast.recipeId } });
              }}
            >
              Popraw
            </Text>
          </View>
        ) : null}

        {plan ? (
          <View style={s.summaryBar}>
            <Text style={text.body}>
              Zakupy <Text style={s.strong}>{zlRound(plan.totalCost)}</Text>
            </Text>
            <Text style={text.muted}>Zostanie {zlRound(plan.leftoverValue)}</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** Kompaktowy stepper przy pozycji planu. */
function MiniStepper({
  label,
  onLess,
  onMore,
  lessOff,
  moreOff,
}: {
  label: string;
  onLess: () => void;
  onMore: () => void;
  lessOff: boolean;
  moreOff: boolean;
}) {
  return (
    <View style={s.mini}>
      <Text
        suppressHighlighting
        accessibilityRole="button"
        accessibilityLabel="mniej"
        style={[s.miniBtn, lessOff && s.miniOff]}
        onPress={lessOff ? undefined : onLess}
      >
        −
      </Text>
      <Text style={s.miniLabel}>{label}</Text>
      <Text
        suppressHighlighting
        accessibilityRole="button"
        accessibilityLabel="więcej"
        style={[s.miniBtn, moreOff && s.miniOff]}
        onPress={moreOff ? undefined : onMore}
      >
        +
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  tweaks: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  miniBtn: { fontSize: 15, color: colors.text, width: 14, textAlign: 'center' },
  miniOff: { color: colors.border },
  miniLabel: { fontSize: 12, color: colors.textMuted, minWidth: 52, textAlign: 'center' },
  coverage: { marginTop: spacing.lg },
  pinTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  link: { textDecorationLine: 'underline' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.text,
  },
  toastText: { color: colors.background, flex: 1 },
  toastAction: { ...type.bodyStrong, color: colors.background, textDecorationLine: 'underline' },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  strong: { ...type.bodyStrong, color: colors.text },
});
