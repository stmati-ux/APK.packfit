import { Fragment } from 'react';
import { router } from 'expo-router';
import { Share, StyleSheet, Text, View } from 'react-native';

import type { ShoppingListItem } from '../../src/core/optimizer.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import {
  Checkbox,
  Empty,
  Fab,
  Row,
  Screen,
  Scroll,
  SectionLabel,
  Title,
  text,
} from '../../src/ui/components.tsx';
import { categoryLabel, leftoverNote, shoppingLine, zlRound } from '../../src/ui/format.ts';
import { shoppingListText } from '../../src/ui/shareText.ts';
import { colors, spacing } from '../../src/ui/theme.ts';

/**
 * Ekran 3 z makiety, najwazniejszy w calej aplikacji.
 *
 * Zasady, ktore musza tu obowiazywac:
 *   - pozycje sa w OPAKOWANIACH, nie w gramach
 *   - grupowanie po kategoriach w kolejnosci obchodzenia sklepu
 *   - odhaczenie dodaje PELNE opakowanie do spizarni
 *   - "mam juz w domu" usuwa produkt i przelicza liste
 */
export default function ShoppingScreen() {
  const { ready, plan, bought, owned, toggleBought, toggleOwned, catalog, settings } = useApp();

  if (!ready) return <Screen />;

  if (!plan) {
    return (
      <Screen>
        <View style={s.fill}>
          <Scroll>
            <Title>Lista zakupów</Title>
            <Empty>
              Najpierw ułóż plan tygodnia w zakładce Plan, albo dorzuć produkty ręcznie
              plusem w rogu.
            </Empty>
          </Scroll>
          <Fab onPress={() => router.push('/dokup')} label="dorzuć produkt" />
        </View>
      </Screen>
    );
  }

  const groups = groupByCategory(plan.shoppingList);

  const share = () => {
    void Share.share({
      message: shoppingListText(plan.shoppingList, {
        mealCount: plan.meals.length,
        people: settings.people,
        totalCost: plan.totalCost,
        bought,
      }),
    });
  };

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title>Lista zakupów</Title>

          <Text
            suppressHighlighting
            accessibilityRole="button"
            style={[text.accent, s.share]}
            onPress={share}
          >
            Wyślij listę
          </Text>

          {plan.shoppingList.length === 0 ? (
            <Empty>Nic nie trzeba kupować. Wszystko masz w domu.</Empty>
          ) : (
            groups.map(([category, items]) => (
              <Fragment key={category}>
                <SectionLabel>{categoryLabel(category)}</SectionLabel>
                {items.map((item) => {
                  const isBought = bought.includes(item.product.id);
                  const note = leftoverNote(item);
                  return (
                    <Row key={item.product.id}>
                      <Checkbox checked={isBought} onPress={() => toggleBought(item.product.id)} />
                      <View style={s.grow}>
                        <Text style={isBought ? text.done : text.body}>{shoppingLine(item)}</Text>
                        {item.fromPantry > 0 ? (
                          <Text style={[text.faint, s.gap]}>część ze spiżarni</Text>
                        ) : null}
                      </View>
                      {note ? <Text style={text.faint}>{note}</Text> : null}
                      <Text
                        suppressHighlighting
                        accessibilityRole="button"
                        style={[text.faint, s.own, owned.includes(item.product.id) && s.ownOn]}
                        onPress={() => toggleOwned(item.product.id)}
                      >
                        mam
                      </Text>
                    </Row>
                  );
                })}
              </Fragment>
            ))
          )}

          {owned.length > 0 ? (
            <>
              <SectionLabel>MAM JUŻ W DOMU</SectionLabel>
              {owned.map((productId) => (
                <Row key={productId}>
                  <View style={s.grow}>
                    <Text style={text.muted}>
                      {catalog.products.find((p) => p.id === productId)?.name ?? productId}
                    </Text>
                  </View>
                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    style={text.accent}
                    onPress={() => toggleOwned(productId)}
                  >
                    przywróć
                  </Text>
                </Row>
              ))}
            </>
          ) : null}
        </Scroll>

        <View style={s.summaryBar}>
          <Text style={text.body}>Razem {zlRound(plan.totalCost)}</Text>
          <Text style={text.muted}>Zostanie {zlRound(plan.leftoverValue)}</Text>
        </View>

        <Fab onPress={() => router.push('/dokup')} label="dorzuć produkt" />
      </View>
    </Screen>
  );
}

function groupByCategory(items: ShoppingListItem[]) {
  const groups = new Map<ShoppingListItem['product']['category'], ShoppingListItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.product.category);
    if (bucket) bucket.push(item);
    else groups.set(item.product.category, [item]);
  }
  return [...groups];
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  gap: { marginTop: 2 },
  share: { paddingBottom: spacing.md },
  own: { paddingHorizontal: spacing.sm },
  ownOn: { color: colors.accent },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
