import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from '../components/ui';
import { syncWorkouts } from '../lib/sync';
import '../state/session';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.line, primary: C.me } };

export default function Root() {
  useEffect(() => {
    syncWorkouts();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') syncWorkouts(); });
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="workout" options={{ gestureEnabled: false }} />
          <Stack.Screen name="exercise/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
          <Stack.Screen name="legal" options={{ headerShown: true, title: 'Terms & privacy', headerBackTitle: 'Back' }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
