import { Tabs } from 'expo-router/js-tabs';
import { C, Icon, type IconName } from '../../components/ui';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: unknown }) => <Icon name={icon} size={22} color={String(color)} />,
});

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.me,
      tabBarInactiveTintColor: C.sub,
      tabBarStyle: { backgroundColor: '#121318', borderTopColor: C.line },
      tabBarLabelStyle: { fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={tab('Today', 'home')} />
      <Tabs.Screen name="plan" options={tab('Plan', 'calendar')} />
      <Tabs.Screen name="library" options={tab('Exercises', 'library')} />
      <Tabs.Screen name="pact" options={tab('Pact', 'people')} />
      <Tabs.Screen name="me" options={tab('Me', 'person-circle')} />
    </Tabs>
  );
}
