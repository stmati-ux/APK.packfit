import { StyleSheet, Text, View } from 'react-native';

import type { WeekRecord } from '../../src/data/store.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { Empty, Row, Screen, Scroll, SectionLabel, Title, text } from '../../src/ui/components.tsx';
import { dayRange, zlRound } from '../../src/ui/format.ts';
import { colors, spacing } from '../../src/ui/theme.ts';

/**
 * Ekran 6 z makiety. Jedyny element grywalizacji w calej aplikacji,
 * i celowo nie dokladamy tu nic wiecej.
 */
export default function SummaryScreen() {
  const { ready, plan, history } = useApp();

  if (!ready) return <Screen />;

  const recent = [...history].reverse().slice(0, 6);

  if (!plan) {
    return (
      <Screen>
        <Scroll>
          <Title>W tym tygodniu</Title>
          <Empty>Podsumowanie pojawi się, gdy ułożysz plan.</Empty>
          <PastWeeks weeks={recent} />
        </Scroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <Scroll>
        <Title>W tym tygodniu</Title>

        <Figure value={zlRound(plan.totalCost)} label="wydane na zakupy" />
        <Figure value={zlRound(plan.leftoverValue)} label="zostanie w lodówce" />

        <View style={s.divider} />

        <Figure
          value={zlRound(plan.averagePlanLeftoverValue)}
          label="zostałoby przy zakupach na oko"
          big
        />

        <Text style={[text.body, s.punchline]}>
          Plan oszczędził ci {zlRound(plan.savings)} jedzenia.
        </Text>

        <PastWeeks weeks={recent} />
      </Scroll>
    </Screen>
  );
}

/**
 * Ostatnie zamkniete tygodnie.
 *
 * Sama lista liczb. Bez wykresow, bez paskow postepu, bez odznak.
 * Trend ma byc widoczny z odczytu, nie z grafiki.
 */
function PastWeeks({ weeks }: { weeks: WeekRecord[] }) {
  if (weeks.length === 0) return null;

  return (
    <>
      <SectionLabel>POPRZEDNIE TYGODNIE</SectionLabel>
      {weeks.map((week) => (
        <Row key={week.id}>
          <Text style={[text.muted, s.range]}>{dayRange(week.from, week.to)}</Text>
          <Text style={[text.body, s.money]}>{zlRound(week.cost)}</Text>
          <Text style={[text.muted, s.money]}>{zlRound(week.actualLeftover)}</Text>
        </Row>
      ))}
      <Text style={[text.faint, s.legend]}>Zakres dat, koszt zakupów, ile zostało.</Text>
    </>
  );
}

function Figure({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <View style={s.figure}>
      <Text style={[text.hero, big && s.big]}>{value}</Text>
      <Text style={[text.muted, s.label]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  figure: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  big: { fontSize: 44 },
  label: { flex: 1 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xl,
  },
  punchline: { marginTop: spacing.xl },
  range: { flex: 1 },
  money: { minWidth: 64, textAlign: 'right' },
  legend: { marginTop: spacing.sm },
});
