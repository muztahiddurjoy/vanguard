import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return (
      <MaterialCommunityIcons name={name} color={color} size={size} importantForAccessibility="no" />
    );
  };
}

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 13, fontFamily: Fonts.semibold },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          tabBarAccessibilityLabel: t.tabs.home,
          tabBarIcon: tabIcon('home-variant'),
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: t.tabs.cases,
          tabBarAccessibilityLabel: t.tabs.cases,
          tabBarIcon: tabIcon('briefcase-outline'),
        }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: t.tabs.help, tabBarAccessibilityLabel: t.tabs.help, tabBarIcon: tabIcon('lifebuoy') }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          title: t.tabs.sos,
          tabBarAccessibilityLabel: t.tabs.sos,
          tabBarIcon: tabIcon('shield-alert'),
          tabBarActiveTintColor: theme.danger,
        }}
      />
    </Tabs>
  );
}
