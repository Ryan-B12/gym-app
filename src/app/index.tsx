import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { C } from '../components/ui';
import { DEMO } from '../lib/supabase';
import { useSession } from '../state/session';
import { useStore } from '../state/store';

export default function Gate() {
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.onboarded);
  const { ready, session } = useSession();
  if (!hydrated || !ready) {
    return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.me} /></View>;
  }
  if (!DEMO && !session) return <Redirect href="/welcome" />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
