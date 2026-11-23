import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { lastSets } from './history';
import { newId } from './sync';
import type { PlanDay } from './types';
import { useStore, type ActiveWorkout, type WorkoutExerciseRecord } from '../state/store';

/** Straight-line distance in meters. */
export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const GYM_RADIUS_M = 200;

/** One location check at the start. Only "yes/no" is kept — never the location itself. */
export async function checkInAtGym(): Promise<boolean> {
  const gym = useStore.getState().gym;
  if (!gym || Platform.OS === 'web') return false;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return false;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return meters({ lat: pos.coords.latitude, lng: pos.coords.longitude }, gym) <= GYM_RADIUS_M;
  } catch {
    return false;
  }
}

export function exerciseRecord(exerciseId: string, sets: number, repRange: [number, number] | null, targetSeconds: number | null, restSec: number): WorkoutExerciseRecord {
  const prev = lastSets(useStore.getState().workouts, exerciseId);
  return {
    id: newId(), exerciseId, repRange, targetSeconds, restSec, effort: null, swappedFrom: null,
    sets: Array.from({ length: sets }, (_, i) => ({
      kind: 'work' as const,
      weight: prev[i]?.weight ?? prev[0]?.weight ?? null,
      reps: targetSeconds ? null : (prev[i]?.reps ?? repRange?.[0] ?? 10),
      seconds: targetSeconds ?? null,
      done: false,
    })),
  };
}

export function buildActive(day: PlanDay | null): ActiveWorkout {
  const unit = useStore.getState().profile.unit;
  if (!day) {
    return { id: newId(), title: 'Workout', planDayKey: null, startedAt: new Date().toISOString(), verifiedAtGym: false, unit, exercises: [], intervals: [], warmupIds: [], cooldownIds: [] };
  }
  const exercises: WorkoutExerciseRecord[] = [];
  const intervals: ActiveWorkout['intervals'] = [];
  let warmupIds: string[] = [];
  let cooldownIds: string[] = [];
  for (const b of day.blocks) {
    if (b.type === 'strength') for (const it of b.items) exercises.push(exerciseRecord(it.exerciseId, it.sets, it.reps ?? null, it.seconds ?? null, it.restSec));
    if (b.type === 'interval' || b.type === 'circuit') intervals.push({ title: b.title, rounds: b.rounds ?? 3, workSec: b.workSec ?? 30, restSec: b.restSec ?? 30, exerciseIds: b.items.map((i) => i.exerciseId), roundsDone: 0 });
    if (b.type === 'warmup') warmupIds = b.items.map((i) => i.exerciseId);
    if (b.type === 'cooldown') cooldownIds = b.items.map((i) => i.exerciseId);
  }
  return { id: newId(), title: day.title, planDayKey: day.key, startedAt: new Date().toISOString(), verifiedAtGym: false, unit, exercises, intervals, warmupIds, cooldownIds };
}

export async function startWorkout(day: PlanDay | null): Promise<void> {
  const active = buildActive(day);
  useStore.setState({ active });
  const verified = await checkInAtGym();
  if (verified) useStore.getState().setActive((a) => ({ ...a, verifiedAtGym: true }));
}
