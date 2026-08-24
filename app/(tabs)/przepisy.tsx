import { Fragment, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { DietTag, DishCategory, Recipe } from '../../src/core/types.ts';
import { DISH_CATEGORY_ORDER } from '../../src/core/types.ts';
import { checkRecipe, isCookableNow, type RecipeFeasibility } from '../../src/core/feasibility.ts';
import { pantryTotals } from '../../src/core/pantry.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { recipePhoto } from '../../src/data/photos.ts';
import {
  Card,
  Chip,
  Empty,
  RecipePhoto,
  Screen,
  Scroll,
  SectionLabel,
  Title,
  Toggle,
  WarningTriangle,
  text,
} from '../../src/ui/components.tsx';
import { colors, radius, spacing, type } from '../../src/ui/theme.ts';

/**
 * Zakladka Przepisy.
 *
 * Filtr wykluczen korzysta z TEGO SAMEGO stanu co ekran konfiguracji.
 * Zmiana tutaj jest widoczna tam i odwrotnie. Jedno zrodlo prawdy.
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

const CATEGORY_LABELS: Record<DishCategory, string> = {
  szybkie: 'SZYBKIE DO 20 MINUT',
  makarony: 'MAKARONY',
  miesne: 'MIĘSNE',
  wegetarianskie: 'WEGETARIAŃSKIE',
  zupy: 'ZUPY',
  inne: 'INNE',
};

export default function RecipesScreen() {
  const { ready, catalog, settings, pantry, entries, toggleTag, addToWeek } = useApp();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyCookable, setOnlyCookable] = useState(false);
  const [query, setQuery] = useState('');

  const totals = useMemo(() => pantryTotals(pantry), [pantry]);

  const feasibility = useMemo(() => {
    const map = new Map<string, RecipeFeasibility>();
    for (const recipe of catalog.recipes) {
      map.set(recipe.id, checkRecipe(recipe, settings.people, totals, catalog.products).status);
    }
    return map;
  }, [catalog, settings.people, totals]);

  const visible = useMemo(() => {
    const excluded = new Set(settings.excludedTags);
    const needle = normalize(query);
    return catalog.recipes.filter((recipe) => {
      // Wykluczony tag usuwa przepis CALKOWICIE, bez wyszarzania.
      if (recipe.tags.some((t) => excluded.has(t))) return false;
      if (onlyCookable && !isCookableNow(feasibility.get(recipe.id) ?? 'nie_zrobisz')) return false;
      if (needle && !normalize(recipe.name).includes(needle)) return false;
      return true;
    });
  }, [catalog.recipes, settings.excludedTags, onlyCookable, feasibility, query]);

  if (!ready) return <Screen />;

  const grouped = groupByDish(visible);
  const inPlan = new Set(entries.map((e) => e.recipeId));

  return (
    <Screen>
      <Scroll>
        <Title sub={`${visible.length} z ${catalog.recipes.length}`}>Przepisy</Title>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Szukaj dania"
          placeholderTextColor={colors.textFaint}
          style={s.search}
          accessibilityLabel="szukaj przepisu"
          clearButtonMode="while-editing"
        />

        <Text
          suppressHighlighting
          accessibilityRole="button"
          style={[text.accent, s.filterToggle]}
          onPress={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? 'Ukryj filtry' : 'Filtry'}
          {settings.excludedTags.length > 0 || onlyCookable
            ? `  (${settings.excludedTags.length + (onlyCookable ? 1 : 0)})`
            : ''}
        </Text>

        {filtersOpen ? (
          <View style={s.filters}>
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
            <Toggle
              label="Mogę zrobić z tego, co mam"
              value={onlyCookable}
              onChange={setOnlyCookable}
            />
          </View>
        ) : null}

        {visible.length === 0 ? (
          <Empty>
            {query
              ? `Nic nie pasuje do "${query}".`
              : 'Nic nie zostało po filtrach. Odznacz coś powyżej.'}
          </Empty>
        ) : (
          grouped.map(([category, recipes]) => (
            <Fragment key={category}>
              <SectionLabel>{CATEGORY_LABELS[category]}</SectionLabel>
              {recipes.map((recipe) => {
                const status = feasibility.get(recipe.id) ?? 'nie_zrobisz';
                const added = inPlan.has(recipe.id);
                return (
                  <Card
                    key={recipe.id}
                    onPress={() =>
                      router.push({ pathname: '/przepis/[id]', params: { id: recipe.id } })
                    }
                  >
                    <RecipePhoto source={recipePhoto(recipe.id, recipe.photoUrl)} />

                    <View style={s.grow}>
                      <View style={s.nameRow}>
                        {status === 'zrobisz_prawie' ? <WarningTriangle size={12} /> : null}
                        <Text style={text.body}>{recipe.name}</Text>
                      </View>
                      <Text style={[text.muted, s.gap]}>{recipe.timeMinutes} min</Text>

                      {added ? (
                        <Text style={[text.faint, s.action]}>w planie</Text>
                      ) : (
                        <Text
                          suppressHighlighting
                          accessibilityRole="button"
                          style={[text.accent, s.action]}
                          onPress={() => addToWeek(recipe.id)}
                        >
                          Dodaj do tygodnia
                        </Text>
                      )}
                    </View>
                  </Card>
                );
              })}
            </Fragment>
          ))
        )}
      </Scroll>
    </Screen>
  );
}

/** Szukanie bez ogonkow i bez wielkosci liter: "zurek" znajdzie "Żurek". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

function groupByDish(recipes: Recipe[]): [DishCategory, Recipe[]][] {
  const groups = new Map<DishCategory, Recipe[]>();
  for (const recipe of recipes) {
    const bucket = groups.get(recipe.dishCategory);
    if (bucket) bucket.push(recipe);
    else groups.set(recipe.dishCategory, [recipe]);
  }
  return [...groups].sort(
    (a, b) => DISH_CATEGORY_ORDER.indexOf(a[0]) - DISH_CATEGORY_ORDER.indexOf(b[0]),
  );
}

const s = StyleSheet.create({
  grow: { flex: 1 },
  gap: { marginTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { marginTop: spacing.sm },
  search: {
    ...type.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  filterToggle: { paddingBottom: spacing.sm },
  filters: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
