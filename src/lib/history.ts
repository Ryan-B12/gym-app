import type { WorkoutRecord } from '../state/store';
import type { ExerciseSession } from './types';

/** Past sessions of one exercise, newest first, in the shape the coach rules expect. */
export function exerciseHistory(workouts: WorkoutRecord[], exerciseId: string): ExerciseSession[] {
  return workouts
    .filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((w) => {
      const e = w.exercises.find((x) => x.exerciseId === exerciseId)!;
      return { date: w.startedAt, unit: w.unit, repRange: e.repRange, targetSeconds: e.targetSeconds, sets: e.sets, effort: e.effort };
    });
}

export function lastSets(workouts: WorkoutRecord[], exerciseId: string) {
  return exerciseHistory(workouts, exerciseId)[0]?.sets.filter((s) => s.kind === 'work' && s.done) ?? [];
}

export function minutesOf(w: { startedAt: string; endedAt: string }) {
  return Math.round((new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 60000);
}

/** Sessions done since the current plan phase started. */
export function sessionsSince(workouts: WorkoutRecord[], since: string | null): number {
  if (!since) return 0;
  return workouts.filter((w) => w.startedAt >= since && minutesOf(w) >= 10).length;
}
