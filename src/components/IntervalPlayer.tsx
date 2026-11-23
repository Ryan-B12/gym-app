import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExercise } from '../lib/exercises';
import type { IntervalBlockRecord } from '../state/store';
import { Button, C, F, Progress, Row, T } from './ui';

type Phase = { kind: 'ready' | 'work' | 'rest' | 'round'; seconds: number; exerciseId?: string; round: number; nextId?: string };

export function buildTimeline(b: IntervalBlockRecord): Phase[] {
  const out: Phase[] = [{ kind: 'ready', seconds: 5, round: 1, nextId: b.exerciseIds[0] }];
  for (let r = 1; r <= b.rounds; r++) {
    b.exerciseIds.forEach((id, i) => {
      out.push({ kind: 'work', seconds: b.workSec, exerciseId: id, round: r });
      const last = i === b.exerciseIds.length - 1;
      if (!last) out.push({ kind: 'rest', seconds: b.restSec, round: r, nextId: b.exerciseIds[i + 1] });
      else if (r < b.rounds) out.push({ kind: 'round', seconds: 60, round: r, nextId: b.exerciseIds[0] });
    });
  }
  return out;
}

function buzz(strong = false) {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(strong ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

function Player({ block, onDone, onClose }: { block: IntervalBlockRecord; onDone: () => void; onClose: () => void }) {
  useKeepAwake();
  const timeline = useMemo(() => buildTimeline(block), [block]);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(timeline[0].seconds);
  const [paused, setPaused] = useState(false);
  const finished = idx >= timeline.length;
  const ph = timeline[Math.min(idx, timeline.length - 1)];
  const ref = useRef({ idx, left });
  useEffect(() => { ref.current = { idx, left }; });

  useEffect(() => {
    if (paused || finished) return;
    const t = setInterval(() => {
      const { idx: i, left: l } = ref.current;
      if (l > 1) { setLeft(l - 1); return; }
      const ni = i + 1;
      setIdx(ni);
      if (ni < timeline.length) { setLeft(timeline[ni].seconds); buzz(timeline[ni].kind === 'work'); } else { buzz(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [paused, finished, timeline]);

  const ex = getExercise((ph.kind === 'work' ? ph.exerciseId : ph.nextId) ?? '');
  const color = ph.kind === 'work' ? C.me : C.partner;
  const label = finished ? 'Done!' : ph.kind === 'work' ? 'Work' : ph.kind === 'ready' ? 'Get ready' : ph.kind === 'round' ? 'Round rest' : 'Rest';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 20, gap: 16 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T style={F.label}>{block.title} · Round {Math.min(ph.round, block.rounds)} of {block.rounds}</T>
        <Button title="Close" kind="ghost" small onPress={onClose} />
      </Row>
      <Progress value={idx / timeline.length} height={4} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <T style={{ color, fontSize: 22, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</T>
        {!finished ? <T style={{ color: C.text, fontSize: 96, fontWeight: '800', fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">{left}</T> : null}
        {!finished && ex ? (
          <>
            <T style={{ ...F.h2, textAlign: 'center' }}>{ph.kind === 'work' ? ex.name : `Next: ${ex.name}`}</T>
            {ex.images[0] ? <Image source={ex.images[0]} style={{ width: 220, height: 150, borderRadius: 16 }} contentFit="cover" accessibilityLabel={ex.name} /> : null}
          </>
        ) : null}
        {finished ? <T style={F.sub}>Nice work. {block.rounds} rounds done.</T> : null}
      </View>
      {finished ? (
        <Button title="Save and close" onPress={onDone} />
      ) : (
        <Row>
          <Button title={paused ? 'Resume' : 'Pause'} kind="secondary" icon={paused ? 'play' : 'pause'} onPress={() => setPaused((p) => !p)} style={{ flex: 1 }} />
          <Button title="Skip" kind="secondary" icon="play-skip-forward" style={{ flex: 1 }} onPress={() => {
            const ni = idx + 1; setIdx(ni); if (ni < timeline.length) setLeft(timeline[ni].seconds);
          }} />
        </Row>
      )}
    </SafeAreaView>
  );
}

export function IntervalPlayer({ block, visible, onDone, onClose }: { block: IntervalBlockRecord | null; visible: boolean; onDone: () => void; onClose: () => void }) {
  return (
    <Modal visible={visible && !!block} animationType="slide" onRequestClose={onClose}>
      {block ? <Player block={block} onDone={onDone} onClose={onClose} /> : null}
    </Modal>
  );
}
