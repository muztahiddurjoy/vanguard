import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { CasesProvider, useCases } from '@/state/cases';
import { SettingsProvider, useSettings } from '@/state/settings';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SettingsProvider>
      <CasesProvider>
        <AppStack />
      </CasesProvider>
    </SettingsProvider>
  );
}

function AppStack() {
  const settings = useSettings();
  const cases = useCases();
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const scheme = useColorScheme();
  const theme = useTheme();
  const { t } = useI18n();
  const loaded = settings.ready && cases.ready && fontsLoaded;

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.tabBar,
      text: theme.text,
      border: theme.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.tabBar },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="case/[token]" options={{ title: '' }} />
        <Stack.Screen name="file" options={{ title: t.file.title }} />
        <Stack.Screen name="track" options={{ title: t.trackScreen.title }} />
        <Stack.Screen name="chat" options={{ title: t.chat.title }} />
        <Stack.Screen name="settings" options={{ title: t.settings.title }} />
      </Stack>
    </ThemeProvider>
  );
}
