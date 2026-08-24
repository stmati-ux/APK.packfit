import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Product } from '../src/core/types.ts';
import { CATEGORY_ORDER } from '../src/core/types.ts';
import { useApp } from '../src/state/AppContext.tsx';
import {
  Empty,
  Hint,
  PrimaryButton,
  Row,
  Screen,
  Scroll,
  SecondaryButton,
  SectionLabel,
  Title,
  text,
} from '../src/ui/components.tsx';
import { amount } from '../src/ui/format.ts';
import { colors, radius, spacing, type } from '../src/ui/theme.ts';

/**
 * Szybkie dodanie do spizarni.
 *
 * Maksymalnie TRZY kroki: wyszukiwarka, wybor z listy, potwierdzenie ilosci.
 * Pole ilosci jest wstepnie wypelnione rozmiarem jednego opakowania, bo to
 * najczestszy przypadek. Uzytkownik zwykle tylko potwierdza.
 */
export default function AddToPantryScreen() {
  const { ready, catalog, addToPantry } = useApp();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Product | null>(null);
  const [draft, setDraft] = useState('');

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return catalog.products
      .filter((p) => normalize(p.name).includes(needle))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
      .slice(0, 12);
  }, [catalog.products, query]);

  if (!ready) return <Screen />;

  const choose = (product: Product) => {
    setPicked(product);
    // Krok trzeci zaczyna sie od gotowej odpowiedzi, nie od pustego pola.
    setDraft(String(product.soldAs === 'luz' ? 500 : (product.packSize ?? 1)));
  };

  const confirm = () => {
    if (!picked) return;
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) addToPantry(picked.id, parsed);
    router.back();
  };

  // --- krok 3: potwierdzenie ilosci ----------------------------------------
  if (picked) {
    return (
      <Screen>
        <View style={s.fill}>
          <Scroll>
            <Title sub={picked.name}>Ile masz?</Title>

            <View style={s.amountRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                keyboardType="numeric"
                style={s.amountInput}
                accessibilityLabel="ilość"
                autoFocus
                selectTextOnFocus
              />
              <Text style={text.body}>{picked.unit}</Text>
            </View>

            <Hint>
              {picked.soldAs === 'luz'
                ? 'Produkt na wagę, wpisz ile masz.'
                : `Wpisane jest jedno opakowanie, ${amount(picked.packSize ?? 0, picked.unit)}.`}
            </Hint>
          </Scroll>

          <View style={s.actions}>
            <PrimaryButton label="Dodaj" onPress={confirm} style={s.action} />
            <SecondaryButton label="Wróć" onPress={() => setPicked(null)} style={s.action} />
          </View>
        </View>
      </Screen>
    );
  }

  // --- kroki 1 i 2: wyszukiwarka i wybor -----------------------------------
  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title>Dodaj do spiżarni</Title>

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

          {query.length === 0 ? (
            <Empty>Wpisz nazwę produktu.</Empty>
          ) : matches.length === 0 ? (
            <Empty>{`Nic nie pasuje do "${query}".`}</Empty>
          ) : (
            <>
              <SectionLabel>WYBIERZ</SectionLabel>
              {matches.map((product) => (
                <Row key={product.id} onPress={() => choose(product)}>
                  <View style={s.grow}>
                    <Text style={text.body}>{product.name}</Text>
                    <Text style={[text.faint, s.gap]}>
                      {product.soldAs === 'luz'
                        ? 'na wagę'
                        : `opak. ${amount(product.packSize ?? 0, product.unit)}`}
                    </Text>
                  </View>
                </Row>
              ))}
            </>
          )}
        </Scroll>

        <View style={s.actions}>
          <SecondaryButton label="Anuluj" onPress={() => router.back()} />
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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amountInput: {
    ...type.title,
    color: colors.text,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flex: 1 },
});
