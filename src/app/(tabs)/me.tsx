import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { Button, C, Card, Chip, F, Field, Icon, Row, Screen, T } from '../../components/ui';
import { AREA_LABELS } from '../../lib/exercises';
import { generatePlan } from '../../lib/plan';
import { setReminders } from '../../lib/reminders';
import { screeningFlagged } from '../../lib/screening';
import { DEMO, errorText, supabase } from '../../lib/supabase';
import { pushOnboarding, pushPain, pushPlan } from '../../lib/sync';
import type { BodyArea } from '../../lib/types';
import { useSession } from '../../state/session';
import { useStore } from '../../state/store';

function ask(title: string, msg: string, yes: string, onYes: () => void, destructive = true) {
  if (Platform.OS === 'web') { onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: destructive ? 'destructive' : 'default', onPress: onYes }]);
}

export default function Me() {
  const { profile, setProfile, painAreas, gym, remindersOn, answers, plan, workouts } = useStore();
  const email = useSession((s) => s.session?.user.email);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const saveProfile = async () => {
    setSaving(true); setMsg('');
    try { await pushOnboarding(); setMsg('Saved.'); } catch (e) { setMsg(`Saved on your phone. Will sync later. (${errorText(e)})`); }
    setSaving(false);
  };

  const setGentle = (on: boolean) => {
    const apply = () => {
      setProfile({ conservative: on });
      if (plan) {
        const p = generatePlan({ ...plan.input, conservative: on, painAreas, seed: Math.floor(Math.random() * 1e9) }, plan.phase);
        useStore.setState({ plan: p });
        pushPlan().catch(() => {});
      }
      pushOnboarding().catch(() => {});
    };
    if (!on && screeningFlagged(answers.screening)) {
      ask('Turn off gentle mode?', 'You answered yes to a health question. Only turn this off if your doctor has said it\'s OK to train harder.', 'My doctor said OK', apply, false);
    } else apply();
  };

  const clearPain = (a: BodyArea) => {
    useStore.setState({ painAreas: painAreas.filter((x) => x !== a) });
    pushPain().catch(() => {});
  };

  const saveGym = async () => {
    setMsg('');
    if (Platform.OS === 'web') { setMsg('Gym check-in works in the phone app.'); return; }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { setMsg('Location is off. You can still log workouts; they just won\'t show "Verified at gym."'); return; }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    useStore.setState({ gym: { name: 'My gym', lat: pos.coords.latitude, lng: pos.coords.longitude } });
    setMsg('Gym saved. Start workouts here to get the "Verified at gym" badge.');
  };

  const signOut = () => ask('Sign out?', 'Workouts not yet synced stay on this phone.', 'Sign out', async () => {
    await supabase.auth.signOut();
    useStore.getState().reset();
    router.replace('/');
  });

  const deleteAccount = () => ask('Delete your account?', 'This permanently deletes your account, workouts, plan and pact history. It can\'t be undone.', 'Delete everything', async () => {
    try {
      if (!DEMO) {
        const { error } = await supabase.rpc('delete_my_account');
        if (error) throw error;
        await supabase.auth.signOut();
      }
      useStore.getState().reset();
      router.replace('/');
    } catch (e) { setMsg(errorText(e)); }
  });

  return (
    <Screen>
      <T style={F.h1}>Me</T>
      {email ? <T style={F.sub}>{email}</T> : null}
      <Card>
        <Field label="Name (your partner sees this)" value={profile.displayName} onChangeText={(t) => setProfile({ displayName: t.slice(0, 40) })} />
        <Field label="Venmo username (optional)" value={profile.venmo} onChangeText={(t) => setProfile({ venmo: t.replace(/[^@A-Za-z0-9_-]/g, '').slice(0, 31) })} autoCapitalize="none" placeholder="@yourname" hint="Lets your partner tap to pay you. The app never handles money." />
        <T style={F.label}>Units</T>
        <Row>
          <Chip label="lb" on={profile.unit === 'lb'} onPress={() => setProfile({ unit: 'lb' })} />
          <Chip label="kg" on={profile.unit === 'kg'} onPress={() => setProfile({ unit: 'kg' })} />
        </Row>
        <Button title="Save" busy={saving} onPress={saveProfile} />
        {msg ? <T style={F.small}>{msg}</T> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T style={F.h3}>Gentle mode</T>
            <T style={F.small}>Lighter moves, no jumping, smaller weight jumps</T>
          </View>
          <Switch value={profile.conservative} onValueChange={setGentle} trackColor={{ true: C.me, false: C.line }} accessibilityLabel="Gentle mode" />
        </Row>
      </Card>

      <Card>
        <T style={F.h3}>Sore spots</T>
        {painAreas.length ? (
          <>
            <T style={F.small}>Only you see these. Tap one when it feels better.</T>
            <Row style={{ flexWrap: 'wrap' }}>
              {painAreas.map((a) => <Chip key={a} label={`${AREA_LABELS[a]} ✕`} on onPress={() => clearPain(a)} />)}
            </Row>
          </>
        ) : <T style={F.sub}>None. Use "Something hurts" during a workout to add one.</T>}
      </Card>

      <Card>
        <T style={F.h3}>Gym check-in</T>
        <T style={F.sub}>{gym ? 'Saved. Workouts started within about 200 m get a "Verified at gym" badge.' : 'Stand in your gym and save it. We only keep the gym spot, never your location.'}</T>
        <Button title={gym ? 'Update to where I am now' : 'Save my gym (I\'m here now)'} kind="secondary" icon="location" onPress={saveGym} />
        {gym ? <Button title="Remove gym" kind="ghost" small onPress={() => useStore.setState({ gym: null })} /> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T style={F.h3}>Weekly reminders</T>
            <T style={F.small}>Thursday evening and Sunday morning</T>
          </View>
          <Switch value={remindersOn} onValueChange={async (v) => { const ok = await setReminders(v); useStore.setState({ remindersOn: v && ok }); }} trackColor={{ true: C.me, false: C.line }} accessibilityLabel="Weekly reminders" />
        </Row>
      </Card>

      <Button title="Change goals, time or equipment" kind="secondary" icon="options" onPress={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })} />
      <Button title="Terms and privacy" kind="ghost" onPress={() => router.push('/legal')} />
      <T style={F.small}>{workouts.length} workouts logged · {workouts.filter((w) => !w.synced).length} waiting to sync</T>
      <Row style={{ marginTop: 8 }}>
        <Button title="Sign out" kind="secondary" onPress={signOut} style={{ flex: 1 }} />
        <Button title="Delete account" kind="danger" onPress={deleteAccount} style={{ flex: 1 }} />
      </Row>
      <Row style={{ justifyContent: 'center', marginTop: 8 }}><Icon name="barbell" size={14} color={C.dim} /><T style={F.small}>v1.0.0</T></Row>
    </Screen>
  );
}
