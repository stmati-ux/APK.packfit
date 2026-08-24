import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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
 * Reczne dorzucenie produktu do listy zakupow, poza planem.
 *
 * Liczy sie tak samo jak stale zakupy: sumuje sie z zapotrzebowaniem
 * z przepisow PRZED policzeniem opakowan, wiec dorzucone mleko i mleko
 * do nalesnikow to dalej jeden karton.
 */
export default function ExtraScreen() {
  const { ready, catalog, extras, addExtra, removeExtra } = useApp();
  const [query, setQuery] = useState('');

  const chosen = useMemo(() => new Set(extras.map((e) => e.productId)), [extras]);

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return catalog.products
      .filter((p) => !chosen.has(p.id) && normalize(p.name).includes(needle))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
      .slice(0, 12);
  }, [catalog.products, query, chosen]);

  if (!ready) return <Screen />;

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title sub="Dorzucone do listy na ten tydzień">Dokup coś</Title>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj produktu"
            placeholderTextColor={colors.textFaint}
            style={s.search}
            accessibilityLabel="szukaj produktu"
            clearButtonMode="while-editing"
            autoFocus
          />

          {matches.length > 0 ? (
            <>
              <SectionLabel>DODAJ</SectionLabel>
              {matches.map((product) => (
                <Row
                  key={product.id}
                  onPress={() => {
                    // Jedno opakowanie to najczestszy przypadek.
                    addExtra(product.id, product.soldAs === 'luz' ? 500 : 1);
                    setQuery('');
                  }}
                >
                  <View style={s.grow}>
                    <Text style={text.body}>{product.name}</Text>
                    <Text style={[text.faint, s.gap]}>
                      {product.soldAs === 'luz'
                        ? 'na wagę'
                        : `opak. ${amount(product.packSize ?? 0, product.unit)}`}
                    </Text>
                  </View>
                  <Text style={text.accent}>Dodaj</Text>
                </Row>
              ))}
            </>
          ) : null}

          <SectionLabel>DORZUCONE</SectionLabel>
          {extras.length === 0 ? (
            <Empty>Nic jeszcze nie dorzuciłeś. Wyszukaj produkt powyżej.</Empty>
          ) : (
            extras.map((item) => {
              const product = catalog.products.find((p) => p.id === item.productId);
              if (!product) return null;
              const step = product.soldAs === 'luz' ? 100 : 1;
              return (
                <Row key={item.id}>
                  <View style={s.grow}>
                    <Text style={text.body}>{product.name}</Text>
                    <Text style={[text.faint, s.gap]}>
                      {product.soldAs === 'luz'
                        ? amount(item.quantity, product.unit)
                        : `${item.quantity} ${opakowania(item.quantity)}`}
                    </Text>
                  </View>
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="mniej"
                    style={[s.step, item.quantity <= step && s.stepOff]}
                    onPress={() =>
                      item.quantity > step && addExtra(item.productId, item.quantity - step)
                    }
                  >
                    −
                  </Text>
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="więcej"
                    style={s.step}
                    onPress={() => addExtra(item.productId, item.quantity + step)}
                  >
                    +
                  </Text>
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="usuń"
                    style={s.remove}
                    onPress={() => removeExtra(item.id)}
                  >
                    ✕
                  </Text>
                </Row>
              );
            })
          )}

          <Hint>
            Znikną przy układaniu nowego planu. Rzeczy kupowane co tydzień wpisz
            w stałe zakupy w konfiguracji.
          </Hint>
        </Scroll>

        <View style={s.actions}>
          <SecondaryButton label="Gotowe" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

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
  actions: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
