import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../src/state/AppContext.tsx';
import { colors } from '../src/ui/theme.ts';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="przepis/[id]" />
          <Stack.Screen name="korekta/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="stale-zakupy" options={{ presentation: 'modal' }} />
          <Stack.Screen name="dokup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="do-spizarni" options={{ presentation: 'modal' }} />
          <Stack.Screen name="produkt" options={{ presentation: 'modal' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
