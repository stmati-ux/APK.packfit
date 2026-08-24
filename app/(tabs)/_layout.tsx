import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon } from '../../src/ui/components.tsx';
import { colors } from '../../src/ui/theme.ts';

/**
 * Piec zakladek. Konfiguracja, szczegoly przepisu i panel korekty
 * nie sa zakladkami, wchodza ze stosu.
 *
 * Podpisy rysuje TabIcon, a wbudowane sa wylaczone: kontener podpisu
 * w react-navigation ma stala wysokosc i przycinal dolne wydluzenia liter.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused }) => <TabIcon name="plan" label="Plan" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="przepisy"
        options={{
          title: 'Przepisy',
          tabBarIcon: ({ focused }) => <TabIcon name="przepisy" label="Przepisy" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="zakupy"
        options={{
          title: 'Zakupy',
          tabBarIcon: ({ focused }) => <TabIcon name="zakupy" label="Zakupy" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="spizarnia"
        options={{
          title: 'Spiżarnia',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="spizarnia" label="Spiżarnia" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="podsumowanie"
        options={{
          title: 'Podsumowanie',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="podsumowanie" label="Podsum." active={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
