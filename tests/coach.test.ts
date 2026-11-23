import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, weightStep } from '../src/lib/coach';
import { getExercise } from '../src/lib/exercises';
import type { ExerciseSession, LoggedSet, Effort } from '../src/lib/types';

const bench = getExercise('Barbell_Bench_Press_-_Medium_Grip')!;
const squat = getExercise('Barbell_Full_Squat')!;
const db = getExercise('Dumbbell_Bench_Press')!;
const plank = getExercise('Plank')!;
const pushups = getExercise('Pushups')!;
const now = new Date('2026-11-20T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

const sets = (w: number | null, reps: number[], warm = 0): LoggedSet[] => [
  ...Array.from({ length: warm }, () => ({ kind: 'warmup' as const, weight: 45, reps: 5, seconds: null, done: true })),
  ...reps.map((r) => ({ kind: 'work' as const, weight: w, reps: r, seconds: null, done: true })),
];
const sess = (daysAgo: number, w: number | null, reps: number[], effort: Effort | null = 'good', warm = 0): ExerciseSession =>
  ({ date: day(daysAgo), unit: 'lb', repRange: [8, 12], targetSeconds: null, sets: sets(w, reps, warm), effort });
const base = { repRange: [8, 12] as [number, number], targetSeconds: null, unit: 'lb' as const, conservative: false, painAreas: [], now };

test('first time: no suggestion', () => {
  assert.equal(suggest({ ...base, exercise: bench, history: [] }).kind, 'none');
});

test('reps first: not at top of range -> add reps', () => {
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 135, [10, 9, 9])] });
  assert.equal(s.kind, 'add_reps');
  assert.equal((s as any).targetReps, 10);
});

test('earned only: one strong session is not enough', () => {
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 135, [12, 12, 12])] });
  assert.notEqual(s.kind, 'increase_weight');
});

test('earned: two strong sessions rated good -> +5 lb upper body, reps reset', () => {
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 135, [12, 12, 12]), sess(6, 135, [12, 12, 12])] });
  assert.equal(s.kind, 'increase_weight');
  assert.equal((s as any).to, 140);
  assert.equal((s as any).resetReps, 8);
});

test('effort hard blocks the increase', () => {
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 135, [12, 12, 12], 'hard'), sess(6, 135, [12, 12, 12])] });
  assert.equal(s.kind, 'hold');
});

test('lower body barbell: +10 lb', () => {
  const s = suggest({ ...base, exercise: squat, history: [sess(3, 185, [12, 12, 12]), sess(6, 185, [12, 12, 12])] });
  assert.equal((s as any).to, 195);
});

test('cap: never more than 10% of a light weight', () => {
  assert.equal(weightStep(squat, 40, 'lb', false), 5); // 10% of 40 = 4 -> rounds to 5
  assert.equal(weightStep(bench, 20, 'lb', false), 2.5);
  assert.equal(weightStep(db, 50, 'lb', false), 5);
  assert.equal(weightStep(squat, 100, 'kg', false), 5);
  assert.equal(weightStep(bench, 60, 'kg', false), 2.5);
});

test('gentle mode: needs 3 sessions and half steps', () => {
  const two = [sess(3, 135, [12, 12, 12]), sess(6, 135, [12, 12, 12])];
  assert.notEqual(suggest({ ...base, conservative: true, exercise: bench, history: two }).kind, 'increase_weight');
  const s = suggest({ ...base, conservative: true, exercise: bench, history: [...two, sess(9, 135, [12, 12, 12])] });
  assert.equal(s.kind, 'increase_weight');
  assert.equal((s as any).to, 137.5);
});

test('warm-up sets are ignored', () => {
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 135, [12, 12, 12], 'good', 2), sess(6, 135, [12, 12, 12], 'good', 2)] });
  assert.equal(s.kind, 'increase_weight');
  assert.equal((s as any).from, 135);
});

test('missed reps once -> hold; twice -> drop 10%', () => {
  assert.equal(suggest({ ...base, exercise: bench, history: [sess(3, 155, [7, 6, 6], 'hard')] }).kind, 'hold');
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 155, [7, 6, 6], 'max'), sess(6, 155, [7, 6, 5], 'hard')] });
  assert.equal(s.kind, 'decrease_weight');
  assert.equal((s as any).to, 140);
});

test('time off: 2+ weeks -> 10% lighter, 4+ weeks -> 20% lighter', () => {
  assert.equal((suggest({ ...base, exercise: bench, history: [sess(15, 200, [12, 12, 12])] }) as any).to, 180);
  assert.equal((suggest({ ...base, exercise: bench, history: [sess(30, 200, [12, 12, 12])] }) as any).to, 160);
});

test('pain blocks suggestions for exercises loading that area', () => {
  const s = suggest({ ...base, painAreas: ['shoulder'], exercise: bench, history: [sess(3, 135, [12, 12, 12]), sess(6, 135, [12, 12, 12])] });
  assert.equal(s.kind, 'blocked_pain');
  const ok = suggest({ ...base, painAreas: ['knee'], exercise: bench, history: [sess(3, 135, [12, 12, 12]), sess(6, 135, [12, 12, 12])] });
  assert.equal(ok.kind, 'increase_weight');
});

test('timed holds add time when earned', () => {
  const h = (d: number, secs: number): ExerciseSession => ({ date: day(d), unit: 'lb', repRange: null, targetSeconds: 30, effort: 'good',
    sets: [1, 2].map(() => ({ kind: 'work' as const, weight: null, reps: null, seconds: secs, done: true })) });
  assert.equal(suggest({ ...base, repRange: null, targetSeconds: 30, exercise: plank, history: [h(2, 30)] }).kind, 'none');
  const s = suggest({ ...base, repRange: null, targetSeconds: 30, exercise: plank, history: [h(2, 30), h(4, 32)] });
  assert.equal(s.kind, 'add_time'); assert.equal((s as any).targetSeconds, 40);
});

test('bodyweight moves never get a weight suggestion', () => {
  const s = suggest({ ...base, exercise: pushups, history: [sess(3, null, [12, 12, 12]), sess(6, null, [12, 12, 12])] });
  assert.equal(s.kind, 'add_reps');
});

test('effort missing (not rated) never earns weight', () => {
  const s = suggest({ ...base, exercise: bench, history: [sess(3, 135, [12, 12, 12], null), sess(6, 135, [12, 12, 12], null)] });
  assert.equal(s.kind, 'hold');
});
