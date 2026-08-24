import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Product } from '../src/core/types.ts';
import { CATEGORY_ORDER } from '../src/core/types.ts';
import { useApp } from '../src/state/AppContext.tsx';
import {
  Empty,
  Hint,
  Row,
  Screen,
  Scroll,
  SecondaryButton,
  SectionLabel,
  Title,
  text,
} from '../src/ui/components.tsx';
import { amount, opakowania } from '../src/ui/format.ts';
import { colors, radius, spacing, type } from '../src/ui/theme.ts';

/**
 * Stale zakupy: rzeczy kupowane co tydzien niezaleznie od planu.
 *
 * Nie maja wlasnej sekcji na liscie zakupow. Z punktu widzenia sklepu to
 * zwykle zakupy, wiec trafiaja do swoich normalnych kategorii, a ich ilosc
 * sumuje sie z zapotrzebowaniem z przepisow PRZED policzeniem opakowan.
 */
export default function StandingScreen() {
  const { ready, catalog, standing, addStanding, removeStanding } = useApp();
  const [query, setQuery] = useState('');

  const chosen = useMemo(
    () => new Set(standing.map((s) => s.productId)),
    [standing],
  );

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return catalog.products
      .filter((p) => !chosen.has(p.id) && normalize(p.name).includes(needle))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
      .slice(0, 12);
  }, [catalog.products, query, chosen]);

  if (!ready) return <Screen />;

  const label = (product: Product, quantity: number) =>
    product.soldAs === 'luz'
      ? amount(quantity, product.unit)
      : `${quantity} ${opakowania(quantity)} po ${amount(product.packSize ?? 0, product.unit)}`;

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title sub="Kupowane co tydzień, niezależnie od planu">Stałe zakupy</Title>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj produktu"
            placeholderTextColor={colors.textFaint}
            style={s.search}
            accessibilityLabel="szukaj produktu"
            clearButtonMode="while-editing"
          />

          {matches.length > 0 ? (
            <>
              <SectionLabel>DODAJ</SectionLabel>
              {matches.map((product) => (
                <Row
                  key={product.id}
                  onPress={() => {
                    // Domyslnie jedno opakowanie, bo to najczestszy przypadek.
                    addStanding(product.id, product.soldAs === 'luz' ? 500 : 1);
                    setQuery('');
                  }}
                >
                  <Text style={[text.body, s.grow]}>{product.name}</Text>
                  <Text style={text.accent}>Dodaj</Text>
                </Row>
              ))}
            </>
          ) : null}

          <SectionLabel>NA LIŚCIE CO TYDZIEŃ</SectionLabel>
          {standing.length === 0 ? (
            <Empty>Nic tu jeszcze nie ma. Wyszukaj produkt powyżej.</Empty>
          ) : (
            standing.map((item) => {
              const product = catalog.products.find((p) => p.id === item.productId);
              if (!product) return null;
              const step = product.soldAs === 'luz' ? 100 : 1;
              return (
                <Row key={item.id}>
                  <View style={s.grow}>
                    <Text style={text.body}>{product.name}</Text>
                    <Text style={[text.faint, s.gap]}>{label(product, item.quantity)}</Text>
                  </View>

                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="mniej"
                    style={[s.step, item.quantity <= step && s.stepOff]}
                    onPress={() =>
                      item.quantity > step && addStanding(item.productId, item.quantity - step)
                    }
                  >
                    −
                  </Text>
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="więcej"
                    style={s.step}
                    onPress={() => addStanding(item.productId, item.quantity + step)}
                  >
                    +
                  </Text>
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="usuń"
                    style={s.remove}
                    onPress={() => removeStanding(item.id)}
                  >
                    ✕
                  </Text>
                </Row>
              );
            })
          )}

          <Hint>
            Te produkty doliczają się do zakupów razem z tym, czego wymagają przepisy.
            Mleko na śniadania i mleko do naleśników pochodzą z tego samego kartonu.
          </Hint>
        </Scroll>

        <View style={s.actions}>
          <SecondaryButton label="Gotowe" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

/** Szukanie bez ogonkow i bez wielkosci liter. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  gap: { marginTop: 2 },
  search: {
    ...type.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  step: { fontSize: 18, color: colors.text, width: 26, textAlign: 'center' },
  stepOff: { color: colors.border },
  remove: { fontSize: 15, color: colors.textFaint, paddingLeft: spacing.sm },
  actions: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
