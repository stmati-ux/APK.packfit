import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { checkRecipe, type IngredientCheck } from '../../src/core/feasibility.ts';
import { pantryTotals } from '../../src/core/pantry.ts';
import { recipePhoto } from '../../src/data/photos.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import {
  Empty,
  PinIcon,
  PrimaryButton,
  RecipePhoto,
  Row,
  Screen,
  Scroll,
  SecondaryButton,
  SectionLabel,
  Title,
  WarningTriangle,
  text,
} from '../../src/ui/components.tsx';
import { amount, recipeMeta } from '../../src/ui/format.ts';
import { colors, spacing } from '../../src/ui/theme.ts';

/**
 * Ekran 4 z makiety.
 *
 * Przycisk "Ugotowane" dziala ZAWSZE, niezaleznie od brakow, i operuje
 * na tym samym stanie co checkbox na ekranie planu.
 */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, catalog, pantry, settings, recipeById, entryFor, toggleCooked, addToWeek } =
    useApp();

  if (!ready) return <Screen />;

  const recipe = recipeById(id);
  if (!recipe) {
    return (
      <Screen>
        <Scroll>
          <Back />
          <Title>Nie znaleziono</Title>
          <Empty>Ten przepis już nie istnieje.</Empty>
        </Scroll>
      </Screen>
    );
  }

  const entry = entryFor(id);
  const check = checkRecipe(recipe, settings.people, pantryTotals(pantry), catalog.products);

  const steps = recipe.instructions
    .split(/(?<=\.)\s+/)
    .map((step) => step.trim())
    .filter((step) => step.length > 0);

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Back />
          <View style={s.photo}>
            <RecipePhoto source={recipePhoto(recipe.id, recipe.photoUrl)} variant="banner" />
          </View>
          <Title sub={recipeMeta(recipe.timeMinutes, settings.people)}>{recipe.name}</Title>

          {entry?.pinned ? (
            <View style={s.pinTag}>
              <PinIcon />
              <Text style={text.faint}>przypięte do tygodnia</Text>
            </View>
          ) : null}

          <SectionLabel>SKŁADNIKI</SectionLabel>
          {check.ingredients.map((ingredient) => (
            <IngredientRow key={ingredient.product.id} check={ingredient} />
          ))}

          <SectionLabel>PRZYGOTOWANIE</SectionLabel>
          {steps.map((step, index) => (
            <View key={step} style={s.step}>
              <Text style={[text.faint, s.stepNumber]}>{index + 1}</Text>
              <Text style={[text.body, s.grow]}>{step}</Text>
            </View>
          ))}

          {entry?.cooked ? (
            <Text
              suppressHighlighting
              accessibilityRole="button"
              style={[text.accent, s.correct]}
              onPress={() => router.push({ pathname: '/korekta/[id]', params: { id } })}
            >
              Popraw zużyte ilości
            </Text>
          ) : null}
        </Scroll>

        <View style={s.actions}>
          {entry ? (
            <>
              <PrimaryButton
                label={entry.cooked ? 'Cofnij' : 'Ugotowane'}
                onPress={() => toggleCooked(id)}
                style={s.action}
              />
              <SecondaryButton
                label="Nie gotowałem"
                onPress={() => router.back()}
                style={s.action}
              />
            </>
          ) : (
            <PrimaryButton
              label="Dodaj do tygodnia"
              onPress={() => {
                addToWeek(id);
                router.back();
              }}
              style={s.action}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

/**
 * Status skladnika.
 *
 * Bursztyn pojawia sie WYLACZNIE przy "prawie". Status "brak" zostaje
 * neutralny i nigdy nie jest czerwony. Aplikacja informuje, nie alarmuje.
 */
function IngredientRow({ check }: { check: IngredientCheck }) {
  const { product, needed, inPantry, shortfall, status } = check;

  return (
    <Row>
      <Text style={[text.body, s.grow]}>{product.name}</Text>
      <Text style={text.muted}>{amount(needed, product.unit)}</Text>

      {status === 'masz' ? <Text style={text.faint}>Masz</Text> : null}

      {status === 'prawie' ? (
        <View style={s.almost}>
          <WarningTriangle />
          <Text style={s.almostText}>
            {amount(inPantry, product.unit).replace(` ${product.unit}`, '')} z{' '}
            {amount(needed, product.unit)}
          </Text>
        </View>
      ) : null}

      {status === 'brak' ? (
        <Text style={text.faint}>Brakuje {amount(shortfall, product.unit)}</Text>
      ) : null}
    </Row>
  );
}

function Back() {
  return (
    <Text
      suppressHighlighting
      accessibilityRole="button"
      accessibilityLabel="wróć"
      style={s.back}
      onPress={() => router.back()}
    >
      ‹
    </Text>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  back: { fontSize: 30, color: colors.text, paddingTop: spacing.sm, lineHeight: 32 },
  photo: { marginTop: spacing.sm },
  pinTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  almost: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  almostText: { fontSize: 12, color: colors.warning },
  step: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  stepNumber: { width: 16 },
  correct: { marginTop: spacing.xl, textDecorationLine: 'underline' },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flex: 1 },
});
