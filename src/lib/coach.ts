/**
 * Coach rules. Plain code, fully tested. An AI model never picks weights.
 * Every result is a suggestion the user must accept with a tap.
 */
import type { BodyArea, Effort, Exercise, ExerciseSession, LoggedSet, Unit } from './types';

export type Suggestion =
  | { kind: 'none'; reason: string }
  | { kind: 'add_reps'; message: string; targetReps: number }
  | { kind: 'add_time'; message: string; targetSeconds: number }
  | { kind: 'increase_weight'; message: string; from: number; to: number; resetReps: number }
  | { kind: 'hold'; message: string }
  | { kind: 'decrease_weight'; message: string; from: number; to: number }
  | { kind: 'blocked_pain'; message: string };

export interface CoachInput {
  exercise: Exercise;
  /** past sessions of THIS exercise, newest first */
  history: ExerciseSession[];
  repRange: [number, number] | null;
  targetSeconds: number | null;
  unit: Unit;
  conservative: boolean;
  painAreas: BodyArea[];
  now?: Date;
}

const UPPER = new Set(['push_h', 'push_v', 'shoulder_iso', 'pull_h', 'pull_v', 'triceps', 'biceps', 'forearms']);
const EASY_ENOUGH: Effort[] = ['easy', 'good'];
const TOO_HARD: Effort[] = ['hard', 'max'];

export function workSets(sets: LoggedSet[]): LoggedSet[] {
  return sets.filter((s) => s.kind === 'work' && s.done);
}

/** Smallest sensible jump. Halved in gentle mode. Never more than 10% of the current weight (with a floor of the smallest plate). */
export function weightStep(ex: Exercise, current: number, unit: Unit, conservative: boolean): number {
  const lower = !UPPER.has(ex.pattern);
  const perDumbbell = ex.gear.includes('dumbbell') || ex.gear.includes('kettlebell');
  let step: number;
  if (unit === 'lb') step = lower && !perDumbbell ? 10 : 5;
  else step = lower && !perDumbbell ? 5 : 2.5;
  if (conservative) step /= 2;
  const smallest = unit === 'lb' ? 2.5 : 1.25;
  const cap = Math.max(smallest, current * 0.1);
  step = Math.min(step, cap);
  return roundTo(step, smallest) || smallest;
}

export function roundTo(n: number, inc: number): number {
  return Math.round(n / inc) * inc;
}

function topWeight(sets: LoggedSet[]): number | null {
  const ws = workSets(sets).map((s) => s.weight).filter((w): w is number => w != null);
  return ws.length ? Math.max(...ws) : null;
}

function daysBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

export function suggest(input: CoachInput): Suggestion {
  const { exercise: ex, history, unit, conservative } = input;
  const now = input.now ?? new Date();

  // 1. pain blocks everything that loads a flagged area
  const hurt = ex.areas.find((a) => input.painAreas.includes(a));
  if (hurt) {
    return { kind: 'blocked_pain', message: `No changes while your ${hurt.replace('_', ' ')} hurts. Keep it light, swap it, or skip it.` };
  }

  const needed = conservative ? 3 : 2;
  const recent = history.filter((h) => workSets(h.sets).length > 0);
  if (recent.length === 0) return { kind: 'none', reason: 'first_time' };

  const last = recent[0];
  const lastW = topWeight(last.sets);

  // 2. time off: come back lighter
  const gap = daysBetween(now, new Date(last.date));
  if (gap >= 14 && lastW != null && lastW > 0) {
    const pct = gap >= 28 ? 0.2 : 0.1;
    const to = Math.max(0, roundTo(lastW * (1 - pct), unit === 'lb' ? 5 : 2.5));
    if (to < lastW) {
      return { kind: 'decrease_weight', from: lastW, to, message: `It's been ${Math.floor(gap)} days. Ease back in at ${to} ${unit}.` };
    }
  }

  // 3. missed reps / too hard
  const range = input.repRange ?? last.repRange;
  if (range && !ex.timed) {
    const missed = (h: ExerciseSession) =>
      workSets(h.sets).filter((s) => (s.reps ?? 0) < range[0]).length >= 2 && (h.effort == null || TOO_HARD.includes(h.effort));
    if (missed(last)) {
      if (recent[1] && missed(recent[1]) && lastW != null && lastW > 0) {
        const to = Math.max(0, roundTo(lastW * 0.9, unit === 'lb' ? 5 : 2.5));
        if (to < lastW) {
          return { kind: 'decrease_weight', from: lastW, to, message: `Missed reps two sessions in a row. Try ${to} ${unit} and build back up.` };
        }
      }
      return { kind: 'hold', message: 'Stay at this weight until you hit the rep range.' };
    }
  }

  // 4. timed moves: add time when earned
  if (ex.timed) {
    const target = input.targetSeconds ?? last.targetSeconds;
    if (!target) return { kind: 'none', reason: 'no_target' };
    if (recent.length < needed) return { kind: 'none', reason: 'not_enough_history' };
    const hit = (h: ExerciseSession) =>
      workSets(h.sets).every((s) => (s.seconds ?? 0) >= target) && (h.effort == null || EASY_ENOUGH.includes(h.effort));
    if (recent.slice(0, needed).every(hit)) {
      const add = conservative ? 5 : 10;
      return { kind: 'add_time', targetSeconds: target + add, message: `You held ${target}s every set. Try ${target + add}s.` };
    }
    return { kind: 'none', reason: 'not_earned' };
  }

  if (!range) return { kind: 'none', reason: 'no_range' };
  const [lo, hi] = range;
  const allTop = (h: ExerciseSession) => {
    const ws = workSets(h.sets);
    return ws.length > 0 && ws.every((s) => (s.reps ?? 0) >= hi);
  };

  // 5. double progression: reps first
  if (!allTop(last)) {
    const minReps = Math.min(...workSets(last.sets).map((s) => s.reps ?? 0));
    const target = Math.min(hi, Math.max(lo, minReps + 1));
    return { kind: 'add_reps', targetReps: target, message: `Aim for ${target} reps on every set.` };
  }

  // 6. weight only when earned: top of range every set, last N sessions, effort easy/good
  if (recent.length < needed) {
    return { kind: 'add_reps', targetReps: hi, message: `Nice. Hit ${hi} reps on every set again to earn more weight.` };
  }
  const earned = recent.slice(0, needed).every((h) => allTop(h) && h.effort != null && EASY_ENOUGH.includes(h.effort));
  if (!earned) return { kind: 'hold', message: `Hold here. Weight goes up after ${needed} strong sessions in a row.` };

  // bodyweight (no load): suggest a harder version instead of weight
  if (lastW == null || lastW === 0) {
    return { kind: 'add_reps', targetReps: hi + 2, message: `Easy for you now. Add 2 reps, or swap to a harder version.` };
  }
  const step = weightStep(ex, lastW, unit, conservative);
  const to = lastW + step;
  return {
    kind: 'increase_weight', from: lastW, to, resetReps: lo,
    message: `You hit ${hi} reps on every set ${needed} sessions running. Try ${to} ${unit} (+${step}) for ${lo} reps.`,
  };
}
