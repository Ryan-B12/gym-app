import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IntervalPlayer } from '../components/IntervalPlayer';
import { Badge, Button, C, Card, Chip, F, Icon, Row, Sheet, T, s as ui } from '../components/ui';
import { suggest, type Suggestion } from '../lib/coach';
import { AREA_LABELS, EXERCISES, getExercise, hasGear } from '../lib/exercises';
import { exerciseHistory, lastSets, minutesOf } from '../lib/history';
import { exerciseRecord } from '../lib/startWorkout';
import { swapOptions, swapReason } from '../lib/swaps';
import { pushPain, syncWorkouts } from '../lib/sync';
import type { BodyArea, Effort } from '../lib/types';
import { useStore, type WorkoutExerciseRecord, type WorkoutRecord } from '../state/store';

const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'easy', label: 'Easy' }, { id: 'good', label: 'Good' }, { id: 'hard', label: 'Hard' }, { id: 'max', label: 'All out' },
];
const AREAS = Object.keys(AREA_LABELS) as BodyArea[];

function clock(sec: number) {
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export default function Workout() {
  const now = useNow();
  const active = useStore((x) => x.active);
  const { profile, answers, painAreas, workouts, setActive } = useStore();
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [painOpen, setPainOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [overall, setOverall] = useState<Effort | null>(null);
  const [query, setQuery] = useState('');
  const [warmDone, setWarmDone] = useState(false);
  const [coolDone, setCoolDone] = useState(false);

  const addList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => e.category !== 'stretching' && hasGear(e, answers.gear) && (!q || e.name.toLowerCase().includes(q))).slice(0, 40);
  }, [query, answers.gear]);

  if (!active) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 20, gap: 16, justifyContent: 'center' }}>
        <T style={F.h2}>No workout running</T>
        <Button title="Back to Today" onPress={() => router.replace('/(tabs)')} />
      </SafeAreaView>
    );
  }

  const elapsed = Math.floor((now - new Date(active.startedAt).getTime()) / 1000);
  const restLeft = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;
  const conservative = profile.conservative;

  const updateEx = (exId: string, fn: (e: WorkoutExerciseRecord) => WorkoutExerciseRecord) =>
    setActive((a) => ({ ...a, exercises: a.exercises.map((e) => (e.id === exId ? fn(e) : e)) }));

  const coachFor = (e: WorkoutExerciseRecord): Suggestion => {
    const ex = getExercise(e.exerciseId);
    if (!ex) return { kind: 'none', reason: 'unknown' };
    return suggest({
      exercise: ex, history: exerciseHistory(workouts, e.exerciseId), repRange: e.repRange, targetSeconds: e.targetSeconds,
      unit: active.unit, conservative, painAreas,
    });
  };

  const applySuggestion = (e: WorkoutExerciseRecord, sg: Suggestion) => {
    updateEx(e.id, (x) => ({
      ...x,
      sets: x.sets.map((st) => {
        if (st.done) return st;
        if (sg.kind === 'increase_weight') return { ...st, weight: sg.to, reps: sg.resetReps };
        if (sg.kind === 'decrease_weight') return { ...st, weight: sg.to };
        return st;
      }),
      targetSeconds: sg.kind === 'add_time' ? sg.targetSeconds : x.targetSeconds,
      ...(sg.kind === 'add_time' ? { sets: x.sets.map((st) => (st.done ? st : { ...st, seconds: sg.targetSeconds })) } : {}),
    }));
    setDismissed((d) => ({ ...d, [e.id]: true }));
  };

  const toggleSet = (e: WorkoutExerciseRecord, i: number) => {
    const willBeDone = !e.sets[i].done;
    updateEx(e.id, (x) => ({ ...x, sets: x.sets.map((st, j) => (j === i ? { ...st, done: !st.done } : st)) }));
    if (willBeDone) setRest({ until: Date.now() + e.restSec * 1000, total: e.restSec });
  };

  const setField = (e: WorkoutExerciseRecord, i: number, field: 'weight' | 'reps' | 'seconds', txt: string) => {
    const n = txt.trim() === '' ? null : Number(txt.replace(',', '.'));
    if (n != null && (Number.isNaN(n) || n < 0 || n > 2000)) return;
    updateEx(e.id, (x) => ({ ...x, sets: x.sets.map((st, j) => (j === i ? { ...st, [field]: n } : st)) }));
  };

  const doSwap = (toId: string) => {
    const from = active.exercises.find((e) => e.id === swapFor);
    if (!from) return;
    const to = getExercise(toId)!;
    const rec = exerciseRecord(toId, from.sets.length, to.timed ? null : from.repRange ?? [8, 12], to.timed ? from.targetSeconds ?? 30 : null, from.restSec);
    setActive((a) => ({ ...a, exercises: a.exercises.map((e) => (e.id === swapFor ? { ...rec, swappedFrom: from.exerciseId } : e)) }));
    setSwapFor(null);
  };

  const togglePain = (a: BodyArea) => {
    const next = painAreas.includes(a) ? painAreas.filter((x) => x !== a) : [...painAreas, a];
    useStore.setState({ painAreas: next });
    pushPain().catch(() => {});
  };

  const save = () => {
    const rec: WorkoutRecord = {
      ...active,
      endedAt: new Date().toISOString(),
      effort: overall,
      exercises: active.exercises.filter((e) => e.sets.some((x) => x.done)),
      synced: false,
    };
    useStore.setState((st) => ({
      workouts: [rec, ...st.workouts],
      active: null,
      nextDay: rec.planDayKey ? st.nextDay + 1 : st.nextDay,
    }));
    syncWorkouts();
    setFinishOpen(false);
    router.replace('/(tabs)');
  };

  const discard = () => {
    const go = () => { useStore.setState({ active: null }); router.replace('/(tabs)'); };
    if (Platform.OS === 'web') { go(); return; }
    Alert.alert('Discard this workout?', 'Nothing from it will be saved.', [{ text: 'Keep going', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: go }]);
  };

  const swapFrom = swapFor ? active.exercises.find((e) => e.id === swapFor) : null;
  const swapList = swapFrom ? swapOptions({
    exerciseId: swapFrom.exerciseId, gear: answers.gear, level: conservative ? 'beginner' : profile.level, painAreas,
    exclude: active.exercises.map((e) => e.exerciseId),
  }) : [];

  const doneSets = active.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const minutesSoFar = minutesOf({ startedAt: active.startedAt, endedAt: new Date(now).toISOString() });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Button title="Minimize" kind="ghost" small icon="chevron-down" onPress={() => router.back()} />
            <Button title="Finish" small onPress={() => setFinishOpen(true)} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T style={F.h1} numberOfLines={1}>{active.title}</T>
            <T style={{ ...F.h3, color: C.sub, fontVariant: ['tabular-nums'] }}>{clock(elapsed)}</T>
          </Row>
          {active.verifiedAtGym ? <Badge label="Verified at gym" icon="location" /> : null}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {active.warmupIds.length ? (
            <Card style={warmDone ? { opacity: 0.6 } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={F.h3}>Warm-up</T>
                <Chip label={warmDone ? 'Done' : 'Mark done'} on={warmDone} onPress={() => setWarmDone((d) => !d)} />
              </Row>
              {active.warmupIds.map((id) => (
                <Pressable key={id} onPress={() => router.push(`/exercise/${id}`)} accessibilityRole="link">
                  <T style={F.sub}>• {getExercise(id)?.name} · 45s</T>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {active.exercises.map((e) => {
            const ex = getExercise(e.exerciseId);
            if (!ex) return null;
            const sg = coachFor(e);
            const prev = lastSets(workouts, e.exerciseId);
            const timed = !!e.targetSeconds;
            const bw = ex.gear.every((g) => g === 'bodyweight' || g === 'bench' || g === 'pullup_bar');
            const anyDone = e.sets.some((x) => x.done);
            const showCoach = !dismissed[e.id] && !anyDone && sg.kind !== 'none';
            return (
              <Card key={e.id}>
                <Row>
                  {ex.images[0] ? <Image source={ex.images[0]} style={{ width: 52, height: 52, borderRadius: 12 }} contentFit="cover" accessibilityLabel={ex.name} /> : (
                    <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}><Icon name="fitness" color={C.sub} /></View>
                  )}
                  <Pressable style={{ flex: 1, gap: 2 }} onPress={() => router.push(`/exercise/${ex.id}`)} accessibilityRole="link" accessibilityLabel={`How to do ${ex.name}`}>
                    <T style={F.h3}>{ex.name}</T>
                    <T style={F.small}>{e.sets.length} × {timed ? `${e.targetSeconds}s` : e.repRange ? `${e.repRange[0]}–${e.repRange[1]} reps` : 'reps'} · rest {e.restSec}s · How-to ›</T>
                  </Pressable>
                </Row>
                {e.swappedFrom ? <T style={F.small}>Swapped in for {getExercise(e.swappedFrom)?.name}</T> : null}
                {prev.length ? <T style={F.small}>Last time: {prev.map((p) => (p.seconds ? `${p.seconds}s` : `${p.weight ?? 'BW'}×${p.reps}`)).join(', ')}</T> : null}

                {showCoach ? (
                  sg.kind === 'blocked_pain' ? (
                    <Card tone="warn">
                      <T>{sg.message}</T>
                      <Button title="Swap it" kind="secondary" small onPress={() => setSwapFor(e.id)} />
                    </Card>
                  ) : sg.kind === 'increase_weight' || sg.kind === 'decrease_weight' || sg.kind === 'add_time' ? (
                    <Card tone="me">
                      <T style={{ ...F.label, color: '#FF9A4D' }}>Coach suggestion</T>
                      <T>{sg.message}</T>
                      <Row>
                        <Button title="Use it" small onPress={() => applySuggestion(e, sg)} style={{ flex: 1 }} />
                        <Button title="Keep same" kind="secondary" small onPress={() => setDismissed((d) => ({ ...d, [e.id]: true }))} style={{ flex: 1 }} />
                      </Row>
                      <T style={F.small}>A suggestion, not medical advice. You decide.</T>
                    </Card>
                  ) : (
                    <Row><Icon name="bulb-outline" size={16} color="#FF9A4D" /><T style={{ ...F.sub, flex: 1 }}>{sg.message}</T></Row>
                  )
                ) : null}

                <Row style={{ gap: 8 }}>
                  <T style={{ ...F.small, width: 34 }}>SET</T>
                  {!timed ? <T style={{ ...F.small, flex: 1 }}>{active.unit.toUpperCase()}</T> : null}
                  <T style={{ ...F.small, flex: 1 }}>{timed ? 'SECONDS' : 'REPS'}</T>
                  <View style={{ width: 48 }} />
                </Row>
                {e.sets.map((st, i) => (
                  <Row key={i} style={{ gap: 8 }}>
                    <T style={{ width: 34, color: C.sub }}>{i + 1}</T>
                    {!timed ? (
                      <TextInput
                        style={[ui.input, { flex: 1, height: 46, textAlign: 'center' }, st.done && { opacity: 0.6 }]}
                        value={st.weight == null ? '' : String(st.weight)} placeholder={bw ? 'BW' : '0'} placeholderTextColor={C.dim}
                        keyboardType="decimal-pad" onChangeText={(t) => setField(e, i, 'weight', t)} accessibilityLabel={`Set ${i + 1} weight`}
                      />
                    ) : null}
                    <TextInput
                      style={[ui.input, { flex: 1, height: 46, textAlign: 'center' }, st.done && { opacity: 0.6 }]}
                      value={timed ? (st.seconds == null ? '' : String(st.seconds)) : (st.reps == null ? '' : String(st.reps))}
                      placeholder="0" placeholderTextColor={C.dim} keyboardType="number-pad"
                      onChangeText={(t) => setField(e, i, timed ? 'seconds' : 'reps', t)} accessibilityLabel={`Set ${i + 1} ${timed ? 'seconds' : 'reps'}`}
                    />
                    <Pressable
                      onPress={() => toggleSet(e, i)} accessibilityRole="checkbox" accessibilityState={{ checked: st.done }} accessibilityLabel={`Set ${i + 1} done`}
                      style={{ width: 48, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: st.done ? C.me : 'transparent', borderWidth: 1, borderColor: st.done ? C.me : C.line }}
                    >
                      <Icon name="checkmark" size={22} color={st.done ? C.meInk : C.dim} />
                    </Pressable>
                  </Row>
                ))}
                <Row>
                  <Button title="Add set" kind="ghost" small icon="add" onPress={() => updateEx(e.id, (x) => ({ ...x, sets: [...x.sets, { ...x.sets[x.sets.length - 1], done: false }] }))} />
                  {e.sets.length > 1 ? <Button title="Remove set" kind="ghost" small onPress={() => updateEx(e.id, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))} /> : null}
                </Row>
                {anyDone ? (
                  <View style={{ gap: 6 }}>
                    <T style={F.small}>How hard was that? (helps the coach)</T>
                    <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                      {EFFORTS.map((f) => <Chip key={f.id} label={f.label} on={e.effort === f.id} onPress={() => updateEx(e.id, (x) => ({ ...x, effort: f.id }))} />)}
                    </Row>
                  </View>
                ) : null}
                <Row>
                  <Button title="Machine's taken" kind="secondary" small icon="swap-horizontal" onPress={() => setSwapFor(e.id)} style={{ flex: 1 }} />
                  <Button title="Something hurts" kind="danger" small icon="bandage" onPress={() => setPainOpen(true)} style={{ flex: 1 }} />
                </Row>
              </Card>
            );
          })}

          {active.intervals.map((b, i) => (
            <Card key={i} tone={b.roundsDone >= b.rounds ? 'good' : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={F.h3}>{b.title}</T>
                <T style={F.small}>{b.rounds} rounds · {b.workSec}s on / {b.restSec}s off</T>
              </Row>
              {b.exerciseIds.map((id) => (
                <Pressable key={id} onPress={() => router.push(`/exercise/${id}`)} accessibilityRole="link"><T style={F.sub}>• {getExercise(id)?.name}</T></Pressable>
              ))}
              <Button title={b.roundsDone >= b.rounds ? 'Done. Run it again?' : 'Start timer'} icon="timer" kind={b.roundsDone >= b.rounds ? 'secondary' : 'primary'} onPress={() => setPlaying(i)} />
            </Card>
          ))}

          {active.cooldownIds.length ? (
            <Card style={coolDone ? { opacity: 0.6 } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={F.h3}>Cool-down stretch</T>
                <Chip label={coolDone ? 'Done' : 'Mark done'} on={coolDone} onPress={() => setCoolDone((d) => !d)} />
              </Row>
              {active.cooldownIds.map((id) => (
                <Pressable key={id} onPress={() => router.push(`/exercise/${id}`)} accessibilityRole="link"><T style={F.sub}>• {getExercise(id)?.name} · 40s</T></Pressable>
              ))}
            </Card>
          ) : null}

          <Button title="Add exercise" kind="secondary" icon="add" onPress={() => setAddOpen(true)} />
          <Button title="Discard workout" kind="ghost" onPress={discard} />
        </ScrollView>

        {rest && restLeft > 0 ? (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: C.card2, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="hourglass" color={C.me} />
            <T style={{ flex: 1, fontWeight: '700' }}>Rest {clock(restLeft)}</T>
            <Button title="+30s" kind="ghost" small onPress={() => setRest((r) => (r ? { ...r, until: r.until + 30000 } : r))} />
            <Button title="Skip" kind="secondary" small onPress={() => setRest(null)} />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Sheet visible={!!swapFor} onClose={() => setSwapFor(null)} title={swapFrom ? `Swap ${getExercise(swapFrom.exerciseId)?.name}` : 'Swap'}>
        <T style={F.sub}>Same muscles, using the gear you said you have.</T>
        {swapList.length ? swapList.map((o) => (
          <Pressable key={o.id} onPress={() => doSwap(o.id)} accessibilityRole="button" style={[ui.choice]}>
            {o.images[0] ? <Image source={o.images[0]} style={{ width: 48, height: 48, borderRadius: 10 }} contentFit="cover" /> : <Icon name="fitness" color={C.sub} />}
            <View style={{ flex: 1 }}>
              <T style={F.h3}>{o.name}</T>
              <T style={F.small}>{swapReason(getExercise(swapFrom!.exerciseId)!, o)}</T>
            </View>
          </Pressable>
        )) : <T style={F.sub}>No good swaps with your equipment. Try "Add exercise" to pick anything.</T>}
      </Sheet>

      <Sheet visible={painOpen} onClose={() => setPainOpen(false)} title="Where does it hurt?">
        <T style={F.sub}>Only you can see this. We stop suggesting more weight for that area and offer swaps. Sharp or lasting pain: stop and see a doctor.</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {AREAS.map((a) => <Chip key={a} label={AREA_LABELS[a]} on={painAreas.includes(a)} onPress={() => togglePain(a)} />)}
        </Row>
        <Button title="Done" onPress={() => setPainOpen(false)} />
      </Sheet>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add exercise">
        <TextInput style={ui.input} value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={C.dim} accessibilityLabel="Search exercises" autoFocus />
        {addList.map((ex) => (
          <Pressable key={ex.id} accessibilityRole="button" style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}
            onPress={() => {
              setActive((a) => ({ ...a, exercises: [...a.exercises, exerciseRecord(ex.id, 3, ex.timed ? null : [8, 12], ex.timed ? 30 : null, 90)] }));
              setAddOpen(false); setQuery('');
            }}>
            <T style={F.h3}>{ex.name}</T>
            <T style={F.small}>{ex.gear.join(', ').replace(/_/g, ' ')}</T>
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={finishOpen} onClose={() => setFinishOpen(false)} title="Finish workout">
        <T style={F.sub}>{minutesSoFar} min · {doneSets} sets done{active.intervals.some((b) => b.roundsDone) ? ' · intervals done' : ''}</T>
        {minutesSoFar < 10 ? <T style={{ color: C.warn }}>Workouts under 10 minutes don't count toward your pact.</T> : null}
        <T style={F.label}>How was it overall?</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {EFFORTS.map((f) => <Chip key={f.id} label={f.label} on={overall === f.id} onPress={() => setOverall(f.id)} />)}
        </Row>
        <Button title="Save workout" onPress={save} />
      </Sheet>

      <IntervalPlayer
        visible={playing != null}
        block={playing != null ? active.intervals[playing] : null}
        onClose={() => setPlaying(null)}
        onDone={() => {
          const i = playing!;
          setActive((a) => ({ ...a, intervals: a.intervals.map((b, j) => (j === i ? { ...b, roundsDone: b.rounds } : b)) }));
          setPlaying(null);
        }}
      />
    </SafeAreaView>
  );
}
