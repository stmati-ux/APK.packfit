import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { Category, SoldAs, Unit } from '../src/core/types.ts';
import { CATEGORY_ORDER } from '../src/core/types.ts';
import { StoreError } from '../src/data/store.ts';
import { useApp } from '../src/state/AppContext.tsx';
import {
  Chip,
  ErrorNote,
  Hint,
  PrimaryButton,
  Screen,
  Scroll,
  SecondaryButton,
  SectionLabel,
  Title,
  text,
} from '../src/ui/components.tsx';
import { categoryLabel } from '../src/ui/format.ts';
import { colors, radius, spacing, type } from '../src/ui/theme.ts';

/**
 * Reczne dopisanie produktu do katalogu.
 *
 * Gramatura opakowania to najwazniejsza dana w tym projekcie, wiec formularz
 * pilnuje jej twardo: opakowanie MUSI miec rozmiar, waga NIE MOZE go miec.
 */
export default function NewProductScreen() {
  const { addProduct } = useApp();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('nabial');
  const [unit, setUnit] = useState<Unit>('g');
  const [soldAs, setSoldAs] = useState<SoldAs>('opakowanie');
  const [packSize, setPackSize] = useState('');
  const [price, setPrice] = useState('');
  const [perishable, setPerishable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const num = (value: string) => Number(value.replace(',', '.'));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await addProduct({
        name: name.trim(),
        category,
        unit,
        soldAs,
        packSize: soldAs === 'opakowanie' ? num(packSize) : null,
        price: num(price),
        perishable,
        // Gramature podal uzytkownik z realnego opakowania, wiec nie trafia
        // na liste do sprawdzenia w sklepie.
        verified: true,
      });
      router.back();
    } catch (err) {
      setError(
        err instanceof StoreError ? err.message : 'Nie udało się zapisać produktu.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={s.fill}>
        <Scroll>
          <Title>Nowy produkt</Title>

          <SectionLabel>NAZWA</SectionLabel>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="np. Oscypek"
            placeholderTextColor={colors.textFaint}
            style={s.input}
          />

          <SectionLabel>KATEGORIA</SectionLabel>
          <View style={s.chips}>
            {CATEGORY_ORDER.map((option) => (
              <Chip
                key={option}
                label={categoryLabel(option).toLowerCase()}
                active={category === option}
                onPress={() => setCategory(option)}
              />
            ))}
          </View>

          <SectionLabel>JAK TO KUPUJESZ</SectionLabel>
          <View style={s.chips}>
            <Chip
              label="w opakowaniu"
              active={soldAs === 'opakowanie'}
              onPress={() => setSoldAs('opakowanie')}
            />
            <Chip label="na wagę" active={soldAs === 'luz'} onPress={() => setSoldAs('luz')} />
          </View>
          <Hint>
            {soldAs === 'opakowanie'
              ? 'Kupujesz całe opakowanie, więc może zostać resztka.'
              : 'Kupujesz dokładnie tyle ile trzeba, więc resztka nie powstaje.'}
          </Hint>

          <SectionLabel>JEDNOSTKA</SectionLabel>
          <View style={s.chips}>
            {(['g', 'ml', 'szt'] as Unit[]).map((option) => (
              <Chip
                key={option}
                label={option}
                active={unit === option}
                onPress={() => setUnit(option)}
              />
            ))}
          </View>

          {soldAs === 'opakowanie' ? (
            <>
              <SectionLabel>GRAMATURA OPAKOWANIA</SectionLabel>
              <TextInput
                value={packSize}
                onChangeText={setPackSize}
                placeholder="np. 400"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                style={s.input}
              />
            </>
          ) : null}

          <SectionLabel>
            {soldAs === 'opakowanie' ? 'CENA ZA OPAKOWANIE' : 'CENA ZA KILOGRAM'}
          </SectionLabel>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="np. 5,29"
            placeholderTextColor={colors.textFaint}
            keyboardType="numeric"
            style={s.input}
          />

          <SectionLabel>CZY RESZTKA SIĘ ZMARNUJE</SectionLabel>
          <View style={s.chips}>
            <Chip label="tak, psuje się" active={perishable} onPress={() => setPerishable(true)} />
            <Chip
              label="nie, zostaje w spiżarni"
              active={!perishable}
              onPress={() => setPerishable(false)}
            />
          </View>
          <Hint>
            Śmietana i pęczek natki psują się. Ryż, makaron i olej nie, bo zużyjesz je później.
          </Hint>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Text style={[text.faint, s.note]}>
            Produkt zapisze się tylko u ciebie i będzie brany pod uwagę przy układaniu planu.
          </Text>
        </Scroll>

        <View style={s.actions}>
          <PrimaryButton label="Zapisz" onPress={save} disabled={saving} style={s.action} />
          <SecondaryButton label="Anuluj" onPress={() => router.back()} style={s.action} />
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    ...type.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  note: { marginTop: spacing.lg },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flex: 1 },
});
