import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, RefreshControl, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, C, Card, Chip, F, Field, Icon, Progress, Row, Sheet, Stepper, T } from '../../components/ui';
import { canRequestPause, daysLeftInWeek, localDate, venmoLink } from '../../lib/pact';
import { loadPact, pactActions, type PactState } from '../../lib/pactApi';
import { DEMO, errorText } from '../../lib/supabase';
import { useStore } from '../../state/store';

const money = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}`;
const nice = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function confirm(title: string, msg: string, yes: string, onYes: () => void) {
  if (Platform.OS === 'web') { onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
}

export default function PactTab() {
  const tz = useStore((s) => s.profile.timezone);
  const [st, setSt] = useState<PactState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [goal, setGoal] = useState(4);
  const [stake, setStake] = useState(20);
  const [code, setCode] = useState('');
  const [proofOpen, setProofOpen] = useState(false);
  const [proofDay, setProofDay] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try { setSt(await loadPact()); } catch (e) { setErr(errorText(e)); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr('');
    try { await fn(); await refresh(); } catch (e) { setErr(errorText(e)); }
    setBusy('');
  };

  const body = () => {
    if (!st) {
      return (
        <>
          <T style={F.sub}>Pick a weekly workout goal with a friend. Whoever misses it owes the other the stake. If you both miss, it's even.</T>
          <Card>
            <T style={F.h3}>Start a pact</T>
            <T style={F.label}>Workouts per week</T>
            <Stepper value={goal} onChange={setGoal} min={1} max={7} />
            <T style={F.label}>Stake</T>
            <Stepper value={stake} onChange={setStake} min={0} max={100} step={5} suffix="$" />
            <T style={F.small}>The app never touches money. It just keeps score. You settle up however you like.</T>
            <Button title="Create pact and get invite code" busy={busy === 'create'} onPress={() => act('create', () => pactActions.create(goal, stake * 100, tz))} />
          </Card>
          <Card>
            <T style={F.h3}>Got a code?</T>
            <Field label="Invite code" value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} autoCapitalize="characters" placeholder="ABC123" />
            <Button title="Join pact" kind="partner" disabled={code.length !== 6} busy={busy === 'join'} onPress={() => act('join', () => pactActions.join(code))} />
          </Card>
        </>
      );
    }

    const { pact, me, partner } = st;
    if (pact.status === 'pending' || !partner) {
      return (
        <Card>
          <T style={F.h3}>Waiting for your partner</T>
          <T style={F.sub}>Send them this code. They download the app and enter it on the Pact tab.</T>
          <T style={{ fontSize: 40, fontWeight: '800', letterSpacing: 6, color: C.me, textAlign: 'center', marginVertical: 8 }} accessibilityLabel={`Invite code ${pact.inviteCode.split('').join(' ')}`}>{pact.inviteCode}</T>
          <T style={F.small}>Goal {pact.goal} workouts a week · {money(pact.stakeCents)} stake. Counting starts the Monday after they join.</T>
          <Button title="Share code" icon="share-outline" onPress={() => Share.share({ message: `Join my workout pact! Goal: ${pact.goal} workouts a week, ${money(pact.stakeCents)} stake. Code: ${pact.inviteCode}` })} />
          <Button title="Cancel pact" kind="ghost" onPress={() => confirm('Cancel this pact?', 'The code stops working.', 'Cancel pact', () => act('end', () => pactActions.end(pact.id)))} />
        </Card>
      );
    }

    const mine = st.counts[me.userId] ?? 0;
    const theirs = st.counts[partner.userId] ?? 0;
    const left = daysLeftInWeek(new Date(), pact.tz);
    const started = pact.startedWeek && pact.startedWeek <= st.thisWeek;
    const today = localDate(new Date(), pact.tz);
    const waitingOnMe = [
      ...st.proofs.filter((p) => p.status === 'pending' && p.userId === partner.userId).map((p) => ({ ...p, type: 'proof' as const })),
      ...st.pauses.filter((p) => p.status === 'pending' && p.userId === partner.userId).map((p) => ({ ...p, type: 'pause' as const })),
    ];
    const nextWeek = addDays(st.thisWeek, 7);
    const pauseWeek = canRequestPause(new Date(), st.thisWeek, pact.tz) && !st.pauses.some((p) => p.userId === me.userId && p.weekStart === st.thisWeek) ? st.thisWeek : nextWeek;
    const pausePending = st.pauses.find((p) => p.userId === me.userId && (p.weekStart ?? '') >= st.thisWeek);
    const proofDays = Array.from({ length: 8 }, (_, i) => addDays(today, -i)).filter((d) => d >= addDays(st.thisWeek, -7));
    const last = st.lastResult;

    return (
      <>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T style={F.h3}>This week</T>
            <T style={F.small}>{started ? (left === 0 ? 'Last day' : `${left} day${left === 1 ? '' : 's'} left`) : `Starts ${nice(pact.startedWeek!)}`}</T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}><T style={{ color: C.me, fontWeight: '700' }}>You</T><T>{mine} / {pact.goal}</T></Row>
          <Progress value={mine / pact.goal} />
          <Row style={{ justifyContent: 'space-between' }}><T style={{ color: C.partner, fontWeight: '700' }}>{partner.name}</T><T>{theirs} / {pact.goal}</T></Row>
          <Progress value={theirs / pact.goal} color={C.partner} />
          <T style={F.small}>{money(pact.stakeCents)} stake · one workout per day counts · 10 min minimum</T>
        </Card>

        {waitingOnMe.length ? (
          <Card tone="me">
            <T style={F.h3}>Needs your OK</T>
            {waitingOnMe.map((r) => (
              <View key={r.id} style={{ gap: 6 }}>
                <T>{r.type === 'proof' ? `${partner.name} says they worked out ${nice(r.day!)}${r.note ? `: "${r.note}"` : ''}` : `${partner.name} asked to pause the week of ${nice(r.weekStart!)}`}</T>
                <Row>
                  <Button small title="Approve" style={{ flex: 1 }} busy={busy === r.id + 'y'} onPress={() => act(r.id + 'y', () => (r.type === 'proof' ? pactActions.decideProof(r.id, true) : pactActions.decidePause(r.id, true)))} />
                  <Button small title="Deny" kind="secondary" style={{ flex: 1 }} busy={busy === r.id + 'n'} onPress={() => act(r.id + 'n', () => (r.type === 'proof' ? pactActions.decideProof(r.id, false) : pactActions.decidePause(r.id, false)))} />
                </Row>
              </View>
            ))}
          </Card>
        ) : null}

        {last ? (
          <Card>
            <T style={F.label}>Week of {nice(last.weekStart)}</T>
            <T>
              {last.members.map((m) => `${m.user_id === me.userId ? 'You' : partner.name} ${m.paused ? 'paused' : `${m.count}/${pact.goal}`}`).join(' · ')}
            </T>
            <T style={F.h2}>
              {last.outcome === 'both_hit' ? 'You both made it.' : last.outcome === 'both_missed' ? 'Both missed. Call it even.'
                : last.members.find((m) => !m.hit)?.user_id === me.userId ? 'You missed this one.' : `${partner.name} missed this one.`}
            </T>
          </Card>
        ) : null}

        {st.ledger.filter((l) => !l.receivedAt).map((l) => {
          const iOwe = l.from === me.userId;
          const other = iOwe ? partner : me;
          return (
            <Card key={l.id} tone={iOwe ? 'warn' : 'good'}>
              <T style={F.label}>Week of {nice(l.weekStart)}</T>
              <T style={F.h2}>{iOwe ? `You owe ${partner.name} ${money(l.amountCents)}` : `${partner.name} owes you ${money(l.amountCents)}`}</T>
              {iOwe ? (
                <>
                  {other.venmo ? <Button title={`Pay with Venmo (${other.venmo})`} kind="partner" icon="open-outline" onPress={() => Linking.openURL(venmoLink(other.venmo!, l.amountCents, 'Gym pact')).catch(() => {})} /> : null}
                  <Button title={l.paidAt ? 'Marked paid. Waiting for them to confirm.' : 'Mark paid'} kind="secondary" disabled={!!l.paidAt} busy={busy === l.id} onPress={() => act(l.id, () => pactActions.markPaid(l.id))} />
                </>
              ) : (
                <>
                  {l.paidAt ? <Badge label="They marked it paid" /> : null}
                  <Button title="Mark received" busy={busy === l.id} onPress={() => act(l.id, () => pactActions.markReceived(l.id))} />
                </>
              )}
              <T style={F.small}>The app never moves money. Settle up however you like.</T>
            </Card>
          );
        })}

        <Card>
          <T style={F.h3}>Worked out but it didn't count?</T>
          <T style={F.sub}>Home workout, check-in missed, forgot to log? Ask {partner.name} to approve it. A missed check-in never counts against you by itself.</T>
          <Button title={`Ask ${partner.name} to approve a day`} kind="secondary" onPress={() => { setProofDay(today); setProofOpen(true); }} />
          {st.proofs.filter((p) => p.userId === me.userId).slice(0, 3).map((p) => (
            <T key={p.id} style={F.small}>{nice(p.day!)}: {p.status}</T>
          ))}
        </Card>

        <Card>
          <T style={F.h3}>Pause a week</T>
          <T style={F.sub}>Sick, traveling or hurt? Ask before the week starts or on its first day. {partner.name} only sees "pause requested," never the reason.</T>
          {pausePending ? <Badge label={`Pause for ${nice(pausePending.weekStart!)}: ${pausePending.status}`} color={pausePending.status === 'approved' ? C.good : C.sub} /> : (
            <Button title={`Request pause for week of ${nice(pauseWeek)}`} kind="secondary" busy={busy === 'pause'} onPress={() => act('pause', () => pactActions.requestPause(pact.id, pauseWeek))} />
          )}
        </Card>

        <Button title="End pact" kind="ghost" onPress={() => confirm('End this pact?', 'Past results stay. No new weeks will be counted.', 'End pact', () => act('end', () => pactActions.end(pact.id)))} />

        <Sheet visible={proofOpen} onClose={() => setProofOpen(false)} title="Which day?">
          <Row style={{ flexWrap: 'wrap' }}>
            {proofDays.map((d) => <Chip key={d} label={nice(d)} on={proofDay === d} onPress={() => setProofDay(d)} />)}
          </Row>
          <Field label="What did you do? (optional)" value={proofNote} onChangeText={(t) => setProofNote(t.slice(0, 280))} placeholder="30 min run outside" />
          <Button title="Send for approval" busy={busy === 'proof'} disabled={!proofDay} onPress={async () => {
            await act('proof', () => pactActions.requestProof(pact.id, proofDay!, proofNote));
            setProofOpen(false); setProofNote('');
          }} />
        </Sheet>
      </>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={C.me} />} keyboardShouldPersistTaps="handled">
        <Row><Icon name="people" color={C.partner} size={26} /><T style={F.h1}>{st?.partner ? `Pact with ${st.partner.name}` : 'Pact'}</T></Row>
        {DEMO ? <Badge label="Demo data" color={C.sub} /> : null}
        {err ? <Card tone="warn"><T>{err}</T></Card> : null}
        {!loading || st ? body() : null}
      </ScrollView>
    </SafeAreaView>
  );
}
