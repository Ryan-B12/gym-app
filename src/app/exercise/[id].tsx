import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ExerciseImage } from '../../components/ExerciseImage';
import { Badge, C, Card, F, Icon, Row, Screen, T } from '../../components/ui';
import { AREA_LABELS, GEAR_LABELS, PATTERN_LABELS, getExercise } from '../../lib/exercises';
import { exerciseHistory } from '../../lib/history';
import { useStore } from '../../state/store';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = getExercise(String(id));
  const workouts = useStore((s) => s.workouts);
  const [frame, setFrame] = useState(0);

  // flip between start and end photos so it reads like a short animation
  useEffect(() => {
    if (!ex || ex.images.length < 2) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % ex.images.length), 1100);
    return () => clearInterval(t);
  }, [ex]);

  if (!ex) return <Screen><T>Exercise not found.</T></Screen>;
  const hist = exerciseHistory(workouts, ex.id).slice(0, 5);

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      {ex.images.length ? (
        <View style={{ gap: 6 }}>
          <ExerciseImage ex={ex} frame={frame} style={{ width: '100%', aspectRatio: 1.45, borderRadius: 20 }} label={`${ex.name}, ${frame === 0 ? 'start' : 'end'} position`} />
          <T style={F.small}>Photos: Free Exercise DB (public domain)</T>
        </View>
      ) : (
        <Card><Row><Icon name="image-outline" color={C.sub} /><T style={F.sub}>Video coming soon. Follow the steps below.</T></Row></Card>
      )}
      <T style={F.h1}>{ex.name}</T>
      <Row style={{ flexWrap: 'wrap' }}>
        <Badge label={PATTERN_LABELS[ex.pattern]} color={C.me} />
        <Badge label={['', 'Beginner', 'Intermediate', 'Advanced'][ex.level]} color={C.sub} />
        {ex.gear.map((g) => <Badge key={g} label={GEAR_LABELS[g]} color={C.partner} />)}
      </Row>
      <Card>
        <T style={F.label}>How to do it</T>
        {ex.instructions.map((step, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }}>
            <T style={{ color: C.me, fontWeight: '800', width: 22 }}>{i + 1}</T>
            <T style={{ flex: 1 }}>{step}</T>
          </Row>
        ))}
      </Card>
      <Card>
        <T style={F.label}>Muscles</T>
        <T>{ex.primary.join(', ')}{ex.secondary.length ? `  ·  also ${ex.secondary.join(', ')}` : ''}</T>
        {ex.areas.length ? <T style={F.small}>Works your {ex.areas.map((a) => AREA_LABELS[a].toLowerCase()).join(', ')}. If one of these hurts, use "Something hurts" in a workout.</T> : null}
      </Card>
      {hist.length ? (
        <Card>
          <T style={F.label}>Your history</T>
          {hist.map((h) => (
            <Row key={h.date} style={{ justifyContent: 'space-between' }}>
              <T style={F.sub}>{new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</T>
              <T style={F.sub}>{h.sets.filter((x) => x.done && x.kind === 'work').map((x) => (x.seconds ? `${x.seconds}s` : `${x.weight ?? 'BW'}×${x.reps}`)).join(', ')}</T>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
