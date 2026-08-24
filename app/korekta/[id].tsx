import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ConsumptionLine } from '../../src/core/types.ts';
import { useApp } from '../../src/state/AppContext.tsx';
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
} from '../../src/ui/components.tsx';
import { colors, radius, spacing, type } from '../../src/ui/theme.ts';

/**
 * Panel korekty zuzycia.
 *
 * SCIEZKA POBOCZNA. Domyslna sciezka to jedno klikniecie checkboxa
 * na ekranie planu i nic wiecej.
 *
 * Spizarnia jest korygowana o ROZNICE miedzy wartoscia poprzednia a nowa.
 */
export default function CorrectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, catalog, recipeById, consumptionFor, applyCorrection } = useApp();

  const recipe = recipeById(id);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(consumptionFor(id).map((line) => [line.productId, String(line.amount)])),
  );

  if (!ready) return <Screen />;

  if (!recipe) {
    return (
      <Screen>
        <Scroll>
          <Title>Korekta</Title>
          <Empty>Nie znaleziono tego dania.</Empty>
        </Scroll>
      </Screen>
    );
  }

  const lines = consumptionFor(id);

  const save = () => {
    const corrected: ConsumptionLine[] = lines.map((line) => {
      const raw = draft[line.productId] ?? String(line.amount);
      const parsed = Number(raw.replace(',', '.'));
      return {
        productId: line.productId,
        amount: Number.isFinite(parsed) ? Math.max(0, parsed) : line.amount,
      };
    });
    applyCorrection(id, corrected);
    router.back();
  };

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title sub={recipe.name}>Ile faktycznie zeszło</Title>

          <SectionLabel>SKŁADNIKI</SectionLabel>
          {lines.map((line) => {
            const product = catalog.products.find((p) => p.id === line.productId);
            return (
              <Row key={line.productId}>
                <Text style={[text.body, s.grow]}>{product?.name ?? line.productId}</Text>
                <TextInput
                  value={draft[line.productId] ?? String(line.amount)}
                  onChangeText={(value) =>
                    setDraft((prev) => ({ ...prev, [line.productId]: value }))
                  }
                  keyboardType="numeric"
                  style={s.input}
                  accessibilityLabel={`ilość: ${product?.name ?? line.productId}`}
                />
                <Text style={text.muted}>{product?.unit ?? 'g'}</Text>
              </Row>
            );
          })}

          <Hint>
            Możesz wpisać więcej, niż przewiduje przepis, jeśli dołożyłeś. Zero oznacza,
            że ostatecznie tego nie użyłeś.
          </Hint>
        </Scroll>

        <View style={s.actions}>
          <PrimaryButton label="Zapisz" onPress={save} style={s.action} />
          <SecondaryButton label="Anuluj" onPress={() => router.back()} style={s.action} />
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  input: {
    ...type.body,
    color: colors.text,
    minWidth: 76,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
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
