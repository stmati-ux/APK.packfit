import { Fragment, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Category, PantryItem, Product } from '../../src/core/types.ts';
import { CATEGORY_ORDER } from '../../src/core/types.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import {
  Empty,
  Fab,
  Row,
  Screen,
  Scroll,
  SecondaryButton,
  SectionLabel,
  Title,
  text,
} from '../../src/ui/components.tsx';
import { addedOn, amount, categoryLabel } from '../../src/ui/format.ts';
import { colors, radius, spacing, type } from '../../src/ui/theme.ts';

/**
 * Ekran 5 z makiety, rozszerzony o reczna korekte.
 *
 * Stan spizarni zawsze w koncu sie rozjedzie, wiec uzytkownik musi miec
 * jak go naprawic: poprawic ilosc albo usunac pozycje.
 *
 * Data dodania jest informacja NEUTRALNA. Aplikacja nie ocenia, czy produkt
 * nadaje sie jeszcze do spozycia.
 */
export default function PantryScreen() {
  const { ready, pantry, catalog, editPantryItem, deletePantryItem, extras, addExtra } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (!ready) return <Screen />;

  const byCategory = groupPantry(pantry, catalog.products);

  const commit = (item: PantryItem) => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) editPantryItem(item.id, parsed);
    setEditing(null);
    setDraft('');
  };

  const onList = new Set(extras.map((e) => e.productId));

  return (
    <Screen>
      <View style={s.fill}>
      <Scroll>
        <Title>Spiżarnia</Title>

        {pantry.length === 0 ? (
          <Empty>Pusto. Spiżarnia napełnia się sama, gdy odhaczasz zakupy.</Empty>
        ) : (
          byCategory.map(([category, entries]) => (
            <Fragment key={category}>
              <SectionLabel>{categoryLabel(category)}</SectionLabel>
              {entries.map(({ item, product }) => (
                <Row key={item.id}>
                  <View style={s.grow}>
                    <Text style={text.body}>{product?.name ?? item.productId}</Text>
                    <View style={s.metaRow}>
                      <Text style={text.faint}>{addedOn(item.addedAt)}</Text>
                      {onList.has(item.productId) ? (
                        <Text style={text.faint}>na liście zakupów</Text>
                      ) : (
                        <Text
                          suppressHighlighting
                          accessibilityRole="button"
                          style={s.toList}
                          onPress={() =>
                            addExtra(item.productId, product?.soldAs === 'luz' ? 500 : 1)
                          }
                        >
                          dokup
                        </Text>
                      )}
                    </View>
                  </View>

                  {editing === item.id ? (
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      onBlur={() => commit(item)}
                      onSubmitEditing={() => commit(item)}
                      keyboardType="numeric"
                      autoFocus
                      style={s.input}
                      accessibilityLabel="popraw ilość"
                    />
                  ) : (
                    <Text
                      suppressHighlighting
                      accessibilityRole="button"
                      style={text.muted}
                      onPress={() => {
                        setEditing(item.id);
                        setDraft(String(item.amount));
                      }}
                    >
                      {amount(item.amount, product?.unit ?? 'g')}
                    </Text>
                  )}

                  <Text
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel="usuń pozycję"
                    style={s.remove}
                    onPress={() => deletePantryItem(item.id)}
                  >
                    ✕
                  </Text>
                </Row>
              ))}
            </Fragment>
          ))
        )}

        <SecondaryButton
          label="Dopisz nowy produkt do katalogu"
          onPress={() => router.push('/produkt')}
          style={s.add}
        />
        <Text style={[text.faint, s.note]}>
          Normalnie spiżarnia napełnia się sama, gdy odhaczasz zakupy.
        </Text>
      </Scroll>

      <Fab onPress={() => router.push('/do-spizarni')} label="dodaj do spiżarni" />
      </View>
    </Screen>
  );
}

function groupPantry(pantry: PantryItem[], products: Product[]) {
  const index = new Map(products.map((p) => [p.id, p]));
  const groups = new Map<Category, { item: PantryItem; product: Product | undefined }[]>();

  for (const item of pantry) {
    const product = index.get(item.productId);
    const category: Category = product?.category ?? 'sypkie';
    const bucket = groups.get(category);
    if (bucket) bucket.push({ item, product });
    else groups.set(category, [{ item, product }]);
  }

  return [...groups].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  toList: { fontSize: 12, color: colors.accent, textDecorationLine: 'underline' },
  gap: { marginTop: 2 },
  input: {
    ...type.body,
    color: colors.text,
    minWidth: 72,
    textAlign: 'right',
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 2,
  },
  remove: { fontSize: 16, color: colors.textFaint, paddingHorizontal: spacing.sm },
  add: { marginTop: spacing.xl, borderRadius: radius.sm },
  note: { marginTop: spacing.sm, textAlign: 'center' },
});
