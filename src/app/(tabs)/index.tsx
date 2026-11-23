import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, C, Card, Chip, F, Icon, Progress, Row, T } from '../../components/ui';
import { getExercise } from '../../lib/exercises';
import { minutesOf, sessionsSince } from '../../lib/history';
import { daysLeftInWeek } from '../../lib/pact';
import { loadPact, pactActions, type PactState } from '../../lib/pactApi';
import { phaseReview } from '../../lib/plan';
import { startWorkout } from '../../lib/startWorkout';
import { syncWorkouts } from '../../lib/sync';
import { useStore } from '../../state/store';

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export default function Today() {
  const { plan, nextDay, active, profile, workouts, planStartedAt, painAreas } = useStore();
  const [pact, setPact] = useState<PactState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await syncWorkouts();
    try { setPact(await loadPact()); } catch { /* offline */ }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const dayIdx = plan ? (pick ?? nextDay % plan.days.length) : 0;
  const day = plan?.days[dayIdx] ?? null;
  const review = plan ? phaseReview({ plan, sessionsDone: sessionsSince(workouts, planStartedAt), painActive: painAreas.length > 0 }) : null;
  const weeksIn = planStartedAt ? Math.floor((now - new Date(planStartedAt).getTime()) / (7 * 86_400_000)) : 0;
  const showReview = review && (review.complete || weeksIn >= (plan?.weeks ?? 4));

  const begin = async () => {
    if (!active) await startWorkout(day);
    router.push('/workout');
  };

  const myCount = pact ? pact.counts[pact.me.userId] ?? 0 : 0;
  const theirCount = pact?.partner ? pact.counts[pact.partner.userId] ?? 0 : 0;
  const left = pact ? daysLeftInWeek(new Date(), pact.pact.tz) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.me} />}>
        <View style={{ gap: 4 }}>
          <T style={F.small}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</T>
          <T style={F.h1}>{profile.displayName ? `Hey ${profile.displayName}` : 'Today'}</T>
        </View>

        {active ? (
          <Card tone="me">
            <Row><Icon name="timer" color={C.me} /><T style={F.h3}>Workout in progress</T></Row>
            <T style={F.sub}>{active.title} · started {ago(active.startedAt)}</T>
            <Button title="Resume" onPress={() => router.push('/workout')} />
          </Card>
        ) : null}

        {pact?.partner && pact.pact.status === 'active' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open pact" onPress={() => router.push('/(tabs)/pact')}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={F.h3}>Pact with {pact.partner.name}</T>
                <T style={F.small}>${pact.pact.stakeCents / 100} · {left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}><T style={{ color: C.me, fontWeight: '700' }}>You</T><T>{myCount} / {pact.pact.goal}</T></Row>
              <Progress value={myCount / pact.pact.goal} />
              <Row style={{ justifyContent: 'space-between' }}><T style={{ color: C.partner, fontWeight: '700' }}>{pact.partner.name}</T><T>{theirCount} / {pact.pact.goal}</T></Row>
              <Progress value={theirCount / pact.pact.goal} color={C.partner} />
              <T style={F.sub}>{myCount >= pact.pact.goal ? 'Goal hit. You\'re safe this week.' : `${pact.pact.goal - myCount} more to stay even.`}</T>
            </Card>
          </Pressable>
        ) : !pact ? (
          <Card>
            <Row><Icon name="people" color={C.partner} /><T style={F.h3}>Train with a partner</T></Row>
            <T style={F.sub}>Set a weekly goal with a friend. Miss it and you owe them. The app keeps score.</T>
            <Button title="Start a pact" kind="secondary" onPress={() => router.push('/(tabs)/pact')} />
          </Card>
        ) : null}

        {showReview && review ? (
          <Card tone="good">
            <Row><Icon name="trophy" color={C.good} /><T style={F.h3}>Phase {plan!.phase} check-in</T></Row>
            <T style={F.sub}>{review.message}</T>
            <Button title="See options" kind="secondary" onPress={() => router.push('/(tabs)/plan')} />
          </Card>
        ) : null}

        {plan && day ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <T style={F.label}>{pick == null ? 'Up next' : 'Picked'}</T>
              <T style={F.small}>~{day.estMinutes} min</T>
            </Row>
            <T style={F.h2}>{day.title}</T>
            {day.blocks.filter((b) => b.type === 'strength' || b.type === 'interval').map((b, i) => (
              <View key={i} style={{ gap: 3 }}>
                {b.type === 'interval' ? <T style={F.small}>{b.title}: {b.rounds} rounds, {b.workSec}s on / {b.restSec}s off</T> : null}
                {b.items.slice(0, 6).map((it) => (
                  <T key={it.exerciseId} style={F.sub} numberOfLines={1}>• {getExercise(it.exerciseId)?.name}</T>
                ))}
              </View>
            ))}
            <Button title={active ? 'Resume workout' : 'Start workout'} icon="play" onPress={begin} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {plan.days.map((d, i) => (
                <Chip key={d.key} label={d.title} on={i === dayIdx} onPress={() => setPick(i)} />
              ))}
            </ScrollView>
          </Card>
        ) : (
          <Card>
            <T style={F.h3}>No plan yet</T>
            <T style={F.sub}>Answer a few questions and we'll build one for your time and gear.</T>
            <Button title="Build my plan" onPress={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })} />
          </Card>
        )}
        <Button title="Quick workout (no plan)" kind="ghost" icon="add" onPress={async () => { if (!active) await startWorkout(null); router.push('/workout'); }} />

        {pact?.feed.length ? (
          <>
            <T style={F.label}>Partner feed</T>
            {pact.feed.slice(0, 6).map((f) => {
              const mine = f.userId === pact.me.userId;
              return (
                <Card key={f.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      <T style={{ color: mine ? C.me : C.partner, fontWeight: '700' }}>{mine ? 'You' : pact.partner?.name}</T> finished {f.title}
                    </T>
                    <T style={F.small}>{ago(f.startedAt)}</T>
                  </Row>
                  <T style={F.sub}>{f.minutes} min{f.exercises ? ` · ${f.exercises} exercises` : ''}{f.sets ? ` · ${f.sets} sets` : ''}</T>
                  <Row style={{ justifyContent: 'space-between' }}>
                    {f.verified ? <Badge label="Verified at gym" icon="location" /> : <View />}
                    {!mine ? (
                      <Button small kind={f.cheeredByMe ? 'secondary' : 'ghost'} icon={f.cheeredByMe ? 'heart' : 'heart-outline'} title={f.cheeredByMe ? 'Cheered' : 'Cheer'}
                        onPress={async () => { await pactActions.cheer(f.id, !f.cheeredByMe); setPact(await loadPact()); }} />
                    ) : f.cheers ? <T style={F.small}>{pact.partner?.name} cheered</T> : null}
                  </Row>
                </Card>
              );
            })}
          </>
        ) : null}

        {workouts.length ? (
          <>
            <T style={F.label}>Your recent workouts</T>
            {workouts.slice(0, 5).map((w) => (
              <Row key={w.id} style={{ justifyContent: 'space-between' }}>
                <T style={{ flex: 1 }} numberOfLines={1}>{w.title}</T>
                <T style={F.small}>{minutesOf(w)} min · {new Date(w.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{w.synced ? '' : ' · saving…'}</T>
              </Row>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
