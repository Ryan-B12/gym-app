import { EXERCISES, PLAN_BLOCKLIST, STAPLES, effectiveLevel, getExercise, hasGear, loadsArea } from './exercises';
import type { BodyArea, Exercise, Gear, Level } from './types';

const LV: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/**
 * "Machine's taken": up to 3 alternatives that train the same pattern
 * with equipment the user has, avoiding sore areas and the same gear if possible.
 */
export function swapOptions(opts: {
  exerciseId: string;
  gear: Gear[];
  level: Level;
  painAreas: BodyArea[];
  exclude?: string[];
  limit?: number;
}): Exercise[] {
  const ex = getExercise(opts.exerciseId);
  if (!ex) return [];
  const max = LV[opts.level];
  const skip = new Set([ex.id, ...(opts.exclude ?? [])]);
  const staples = STAPLES[ex.pattern] ?? [];
  const pool = EXERCISES.filter(
    (e) =>
      e.pattern === ex.pattern && !skip.has(e.id) && !PLAN_BLOCKLIST.has(e.id) &&
      e.category !== 'olympic weightlifting' && e.category !== 'stretching' &&
      effectiveLevel(e) <= max && hasGear(e, opts.gear) && !loadsArea(e, opts.painAreas),
  );
  const score = (e: Exercise) => {
    const si = staples.indexOf(e.id);
    let s = si >= 0 ? 50 - si * 3 : 0;
    // different equipment is the whole point when the machine is taken
    if (e.gear[0] !== ex.gear[0]) s += 15;
    if (e.compound === ex.compound) s += 10;
    if (e.timed === ex.timed) s += 10;
    if (e.images.length) s += 2;
    return s;
  };
  const sorted = pool.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  // one per main equipment type first, so options feel different
  const out: Exercise[] = [];
  const seenGear = new Set<string>();
  for (const e of sorted) {
    if (out.length >= (opts.limit ?? 3)) break;
    if (seenGear.has(e.gear[0])) continue;
    out.push(e);
    seenGear.add(e.gear[0]);
  }
  for (const e of sorted) {
    if (out.length >= (opts.limit ?? 3)) break;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

export function swapReason(from: Exercise, to: Exercise): string {
  if (to.gear[0] === 'bodyweight') return 'No equipment needed';
  if (to.gear[0] !== from.gear[0]) return `Uses ${to.gear[0].replace('_', ' ')} instead`;
  return 'Same muscles, different angle';
}
