import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, C, Card, F, Field, Icon, Row, Screen, T } from '../components/ui';
import { errorText, supabase } from '../lib/supabase';
import { restoreFromServer } from '../lib/sync';
import { useStore } from '../state/store';

export default function Welcome() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [usePw, setUsePw] = useState(false);
  const [pw, setPw] = useState('');

  const send = async () => {
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    setBusy(false);
    if (error) setErr(errorText(error)); else setSent(true);
  };

  const verify = async () => {
    setErr(''); setBusy(true);
    const { error } = usePw
      ? await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw })
      : await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) { setBusy(false); setErr(errorText(error)); return; }
    // returning user on a new phone: bring back their setup
    if (!useStore.getState().onboarded) {
      try { await restoreFromServer(); } catch { /* fine: they'll onboard */ }
    }
    setBusy(false);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 40, gap: 10 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: C.me, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="barbell" size={34} color={C.meInk} />
          </View>
          <T style={F.h1}>Train with a plan.{'\n'}Show up for your partner.</T>
          <T style={F.sub}>A workout plan built for your time and gear, a coach that tells you when to go heavier, and a weekly pact with a friend.</T>
        </View>
        <Card>
          {usePw ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
              <Button title="Sign in" onPress={verify} busy={busy} disabled={!email || !pw} />
              <Button title="Use an email code instead" kind="ghost" small onPress={() => setUsePw(false)} />
            </>
          ) : !sent ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
              <Button title="Email me a code" onPress={send} busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
              <T style={F.small}>No password. We'll email you a 6-digit code.</T>
              <Button title="Sign in with a password" kind="ghost" small onPress={() => setUsePw(true)} />
            </>
          ) : (
            <>
              <T style={F.sub}>Enter the code we sent to {email.trim()}.</T>
              <Field label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))} placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" />
              <Button title="Sign in" onPress={verify} busy={busy} disabled={code.length < 6} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Button title="Use another email" kind="ghost" small onPress={() => { setSent(false); setCode(''); }} />
                <Button title="Resend" kind="ghost" small onPress={send} />
              </Row>
            </>
          )}
          {err ? <T style={{ color: C.warn }}>{err}</T> : null}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
