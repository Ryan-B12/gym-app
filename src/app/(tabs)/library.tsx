import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Chip, F, Icon, Row, T, s as ui } from '../../components/ui';
import { EXERCISES, PATTERN_LABELS, hasGear } from '../../lib/exercises';
import type { Exercise } from '../../lib/types';
import { useStore } from '../../state/store';

type Filter = 'all' | 'strength' | 'hiit' | 'bodyweight' | 'bands' | 'dumbbell' | 'kettlebell' | 'stretch';
const FILTERS: { id: Filter; label: string; test: (e: Exercise) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'strength', label: 'Strength', test: (e) => e.category === 'strength' || e.category === 'powerlifting' },
  { id: 'hiit', label: 'HIIT / cardio', test: (e) => e.pattern === 'plyo' || e.pattern === 'cardio' },
  { id: 'bodyweight', label: 'Bodyweight', test: (e) => e.gear.every((g) => g === 'bodyweight') },
  { id: 'bands', label: 'Bands', test: (e) => e.gear.includes('bands') },
  { id: 'dumbbell', label: 'Dumbbells', test: (e) => e.gear.includes('dumbbell') },
  { id: 'kettlebell', label: 'Kettlebells', test: (e) => e.gear.includes('kettlebell') },
  { id: 'stretch', label: 'Stretch', test: (e) => e.pattern === 'mobility' },
];

export default function Library() {
  const gear = useStore((s) => s.answers.gear);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [mine, setMine] = useState(true);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const test = FILTERS.find((x) => x.id === f)!.test;
    return EXERCISES.filter((e) => test(e) && (!mine || hasGear(e, gear)) && (!query || e.name.toLowerCase().includes(query) || e.primary.some((m) => m.includes(query))));
  }, [q, f, mine, gear]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ padding: 20, paddingBottom: 8, gap: 12 }}>
        <T style={F.h1}>Exercises</T>
        <View style={{ justifyContent: 'center' }}>
          <TextInput style={[ui.input, { paddingLeft: 42 }]} value={q} onChangeText={setQ} placeholder="Search by name or muscle" placeholderTextColor={C.dim} accessibilityLabel="Search exercises" />
          <View style={{ position: 'absolute', left: 14 }} pointerEvents="none"><Icon name="search" color={C.dim} /></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="My equipment" icon="checkmark-done" on={mine} onPress={() => setMine((m) => !m)} />
          {FILTERS.map((x) => <Chip key={x.id} label={x.label} on={f === x.id} onPress={() => setF(x.id)} />)}
        </ScrollView>
        <T style={F.small}>{list.length} exercises</T>
      </View>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        initialNumToRender={14}
        renderItem={({ item: e }) => (
          <Pressable onPress={() => router.push(`/exercise/${e.id}`)} accessibilityRole="link" accessibilityLabel={e.name}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            {e.images[0] ? <Image source={e.images[0]} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: C.card2 }} contentFit="cover" recyclingKey={e.id} /> : (
              <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}><Icon name="fitness" color={C.sub} /></View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <T style={F.h3} numberOfLines={1}>{e.name}</T>
              <T style={F.small} numberOfLines={1}>{PATTERN_LABELS[e.pattern]} · {e.gear.join(', ').replace(/_/g, ' ')}</T>
            </View>
            <Row style={{ gap: 2 }}>{[1, 2, 3].map((n) => <View key={n} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: n <= e.level ? C.me : C.line }} />)}</Row>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
