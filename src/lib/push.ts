import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { DEMO, supabase } from './supabase';

export type NotifyPrefs = { partner_workouts: boolean; cheers: boolean; pact: boolean; nudges: boolean };
export const DEFAULT_PREFS: NotifyPrefs = { partner_workouts: true, cheers: true, pact: true, nudges: true };

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
    ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Ask for permission (only when `ask` is true), get this phone's Expo push token
 * and save it to the signed-in user. Returns a short reason when it can't.
 */
export async function registerForPush(ask: boolean): Promise<'ok' | 'denied' | 'unsupported' | 'no-project' | 'signed-out'> {
  if (Platform.OS === 'web' || DEMO) return 'unsupported';
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 'signed-out';
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  const pid = projectId();
  if (!pid) return 'no-project';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    return 'ok';
  } catch {
    return 'unsupported';
  }
}

export async function loadPrefs(): Promise<NotifyPrefs> {
  if (DEMO) return DEFAULT_PREFS;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return DEFAULT_PREFS;
  const { data } = await supabase.from('profile_private').select('notify').eq('user_id', s.session.user.id).maybeSingle();
  return { ...DEFAULT_PREFS, ...(data?.notify ?? {}) };
}

export async function savePrefs(p: NotifyPrefs): Promise<void> {
  if (DEMO) return;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return;
  const { error } = await supabase.from('profile_private').update({ notify: p }).eq('user_id', s.session.user.id);
  if (error) throw error;
}

/** Tapping a notification opens the screen it's about. */
export function listenForTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  const open = (kind?: unknown) => {
    if (kind === 'pact' || kind === 'nudges') router.push('/(tabs)/pact');
    else router.push('/(tabs)');
  };
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.kind));
  Notifications.getLastNotificationResponseAsync().then((r) => { if (r) open(r.notification.request.content.data?.kind); }).catch(() => {});
  return () => sub.remove();
}
