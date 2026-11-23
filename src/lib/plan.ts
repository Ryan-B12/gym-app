/**
 * Plan builder. Fixed, testable rules — no AI picks exercises, sets or reps.
 * Same input + seed always gives the same plan.
 */
import {
  COOLDOWN_MOVES, EXERCISES, LOW_IMPACT_CONDITIONING, PLAN_BLOCKLIST, STAPLES, WARMUP_MOVES,
  effectiveLevel, getExercise, hasGear, loadsArea,
} from './exercises';
import type {
  Block, BlockItem, Exercise, Goal, Level, Pattern, Plan, PlanDay, PlanInput,
} from './types';

export const PHASE_WEEKS = 4;

// ---------- helpers ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_NUM: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

export function primaryGoal(goals: Goal[]): Goal {
  const order: Goal[] = ['get_stronger', 'build_muscle', 'lose_fat', 'endurance', 'general_health', 'mobility'];
  return order.find((g) => goals.includes(g)) ?? 'general_health';
}

export function wantsConditioning(input: PlanInput): boolean {
  if (input.hiit === 'none') return false;
  if (input.hiit === 'lots') return true;
  return input.goals.includes('lose_fat') || input.goals.includes('endurance') || input.goals.includes('general_health');
}

type Role = 'main' | 'acc';
interface Slot { pattern: Pattern; role: Role }

const S = (pattern: Pattern, role: Role = 'acc'): Slot => ({ pattern, role });

const TEMPLATES: Record<string, { title: string; slots: Slot[] }> = {
  full_a: { title: 'Full Body A', slots: [S('squat', 'main'), S('push_h', 'main'), S('pull_h', 'main'), S('hinge'), S('push_v'), S('core'), S('biceps'), S('triceps')] },
  full_b: { title: 'Full Body B', slots: [S('hinge', 'main'), S('push_v', 'main'), S('pull_v', 'main'), S('lunge'), S('push_h'), S('core'), S('shoulder_iso'), S('calves')] },
  full_c: { title: 'Full Body C', slots: [S('lunge', 'main'), S('push_h', 'main'), S('pull_v', 'main'), S('squat'), S('pull_h'), S('core'), S('shoulder_iso'), S('triceps')] },
  upper_a: { title: 'Upper Body A', slots: [S('push_h', 'main'), S('pull_h', 'main'), S('push_v'), S('pull_v'), S('triceps'), S('biceps'), S('core')] },
  upper_b: { title: 'Upper Body B', slots: [S('push_v', 'main'), S('pull_v', 'main'), S('push_h'), S('pull_h'), S('shoulder_iso'), S('biceps'), S('core')] },
  lower_a: { title: 'Lower Body A', slots: [S('squat', 'main'), S('hinge'), S('lunge'), S('legs_iso'), S('calves'), S('core')] },
  lower_b: { title: 'Lower Body B', slots: [S('hinge', 'main'), S('squat'), S('lunge'), S('hip_iso'), S('calves'), S('core')] },
  push: { title: 'Push', slots: [S('push_h', 'main'), S('push_v', 'main'), S('push_h'), S('shoulder_iso'), S('triceps'), S('core')] },
  pull: { title: 'Pull', slots: [S('pull_v', 'main'), S('pull_h', 'main'), S('pull_h'), S('shoulder_iso'), S('biceps'), S('core')] },
  legs: { title: 'Legs', slots: [S('squat', 'main'), S('hinge', 'main'), S('lunge'), S('legs_iso'), S('calves'), S('core')] },
};

/** Which days make up the week. 'hiit' = a conditioning day. */
export function weekLayout(days: number, conditioning: boolean, hiitPref: PlanInput['hiit']): string[] {
  const d = Math.max(2, Math.min(6, Math.round(days)));
  if (hiitPref === 'lots') {
    const lots: Record<number, string[]> = {
      2: ['full_a', 'hiit'], 3: ['full_a', 'hiit', 'full_b'], 4: ['full_a', 'hiit', 'full_b', 'hiit'],
      5: ['upper_a', 'hiit', 'lower_a', 'hiit', 'full_c'], 6: ['upper_a', 'hiit', 'lower_a', 'hiit', 'upper_b', 'lower_b'],
    };
    return lots[d];
  }
  const base: Record<number, string[]> = {
    2: ['full_a', 'full_b'],
    3: conditioning ? ['full_a', 'hiit', 'full_b'] : ['full_a', 'full_b', 'full_c'],
    4: conditioning ? ['upper_a', 'lower_a', 'hiit', 'full_a'] : ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
    5: conditioning ? ['push', 'pull', 'legs', 'hiit', 'full_a'] : ['push', 'pull', 'legs', 'upper_a', 'lower_a'],
    6: conditioning ? ['push', 'pull', 'legs', 'hiit', 'upper_b', 'lower_b'] : ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
  };
  return base[d];
}

// ---------- prescription ----------

interface Rx { sets: number; reps: [number, number]; seconds: number; restSec: number }

export function prescription(input: PlanInput, role: Role): Rx {
  const goal = primaryGoal(input.goals);
  const lvl = input.conservative ? 1 : LEVEL_NUM[input.level];
  let reps: [number, number];
  let rest: number;
  if (goal === 'get_stronger' && role === 'main') {
    reps = lvl === 1 ? [8, 10] : [5, 8];
    rest = lvl === 1 ? 120 : 150;
  } else if (goal === 'build_muscle' || goal === 'get_stronger') {
    reps = role === 'main' ? [8, 12] : [10, 15];
    rest = role === 'main' ? 90 : 60;
  } else {
    reps = [10, 15];
    rest = role === 'main' ? 75 : 60;
  }
  let sets = role === 'main' ? (lvl === 3 ? 4 : 3) : (lvl === 1 ? 2 : 3);
  const seconds = lvl === 1 ? 20 : lvl === 2 ? 30 : 40;
  if (input.conservative) {
    sets = Math.min(sets, 2);
    reps = [10, 15];
    rest += 30;
  }
  return { sets, reps, seconds, restSec: rest };
}

/** Rough minutes for one strength item: ~40 s per set plus rest, plus set-up time. */
function itemMinutes(it: BlockItem): number {
  const work = it.seconds ?? 40;
  return (it.sets * (work + it.restSec) + 30) / 60;
}

// ---------- exercise picking ----------

interface Ctx {
  input: PlanInput;
  rand: () => number;
  used: Map<string, number>;
  maxLevel: number;
}

function allowed(ex: Exercise, ctx: Ctx): boolean {
  const { input } = ctx;
  if (PLAN_BLOCKLIST.has(ex.id)) return false;
  if (ex.category === 'olympic weightlifting' || ex.category === 'powerlifting' && effectiveLevel(ex) > 2) return false;
  if (effectiveLevel(ex) > ctx.maxLevel) return false;
  if (!hasGear(ex, input.gear)) return false;
  if (loadsArea(ex, input.painAreas)) return false;
  if (input.conservative && ex.pattern === 'plyo') return false;
  return true;
}

const FALLBACK: Partial<Record<Pattern, Pattern[]>> = {
  pull_v: ['pull_h'],
  pull_h: ['pull_v'],
  push_v: ['shoulder_iso', 'push_h'],
  push_h: ['push_v'],
  legs_iso: ['lunge', 'squat'],
  hip_iso: ['hinge', 'lunge'],
  lunge: ['squat'],
  squat: ['lunge'],
  hinge: ['lunge'],
  shoulder_iso: ['push_v'],
};

export function pickExercise(pattern: Pattern, role: Role, ctx: Ctx, dayUsed: Set<string>): Exercise | null {
  const tryPattern = (p: Pattern): Exercise | null => {
    const staples = STAPLES[p] ?? [];
    const pool = EXERCISES.filter((e) => e.pattern === p && allowed(e, ctx) && !dayUsed.has(e.id) && e.category !== 'stretching');
    if (!pool.length) return null;
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    for (const e of pool) {
      const si = staples.indexOf(e.id);
      let score = si >= 0 ? 100 - si * 4 : 0;
      if (role === 'main' && e.compound) score += 20;
      if (role === 'main' && e.timed) score -= 40;
      if (e.source === 'app' && !e.images.length) score -= 3; // prefer moves with photos when it's close
      score -= (ctx.used.get(e.id) ?? 0) * 35; // variety across days
      if (ctx.maxLevel === 1 && effectiveLevel(e) === 1) score += 5;
      score += ctx.rand() * 8;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  };
  const first = tryPattern(pattern);
  if (first) return first;
  for (const alt of FALLBACK[pattern] ?? []) {
    const e = tryPattern(alt);
    if (e) return e;
  }
  return null;
}

function itemFor(ex: Exercise, rx: Rx): BlockItem {
  return ex.timed
    ? { exerciseId: ex.id, sets: rx.sets, seconds: rx.seconds, restSec: Math.min(rx.restSec, 60) }
    : { exerciseId: ex.id, sets: rx.sets, reps: rx.reps, restSec: rx.restSec };
}

function warmup(ctx: Ctx, minutes: number, seedOffset: number): Block {
  const pool = WARMUP_MOVES.filter((id) => {
    const e = getExercise(id);
    return e && !loadsArea(e, ctx.input.painAreas) && hasGear(e, ctx.input.gear);
  });
  const count = minutes >= 5 ? 4 : 3;
  const start = seedOffset % Math.max(pool.length, 1);
  const items = Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length])
    .map((id) => ({ exerciseId: id, sets: 1, seconds: 45, restSec: 0 }));
  return { type: 'warmup', title: 'Warm-up', items };
}

function cooldown(ctx: Ctx, minutes: number, seedOffset: number): Block {
  const pool = COOLDOWN_MOVES.filter((id) => {
    const e = getExercise(id);
    return e && hasGear(e, ctx.input.gear);
  });
  const count = minutes >= 4 ? 4 : 3;
  const start = (seedOffset * 3) % Math.max(pool.length, 1);
  const items = Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length])
    .map((id) => ({ exerciseId: id, sets: 1, seconds: 40, restSec: 0 }));
  return { type: 'cooldown', title: 'Cool-down stretch', items };
}

export function intervalTiming(level: Level, conservative: boolean): { workSec: number; restSec: number } {
  if (conservative || level === 'beginner') return { workSec: 20, restSec: 40 };
  if (level === 'intermediate') return { workSec: 30, restSec: 30 };
  return { workSec: 40, restSec: 20 };
}

function conditioningPool(ctx: Ctx): Exercise[] {
  const { input } = ctx;
  const noJumping = input.conservative || input.painAreas.includes('knee') || input.painAreas.includes('ankle');
  const ids = noJumping ? LOW_IMPACT_CONDITIONING : [...(STAPLES.plyo ?? []), ...LOW_IMPACT_CONDITIONING];
  return ids.map((id) => getExercise(id)).filter((e): e is Exercise => !!e && allowed(e, ctx));
}

function intervalBlock(ctx: Ctx, minutes: number, title: string, moves: number, avoid: Set<string> = new Set()): Block | null {
  const all = conditioningPool(ctx);
  const fresh = all.filter((e) => !avoid.has(e.id));
  const pool = fresh.length >= moves ? fresh : all;
  if (!pool.length) return null;
  const { workSec, restSec } = intervalTiming(ctx.input.level, ctx.input.conservative);
  // rotate the pool by a seeded amount so different days get different moves
  const start = Math.floor(ctx.rand() * pool.length);
  const picked: Exercise[] = [];
  for (let i = 0; i < pool.length && picked.length < moves; i++) {
    const e = pool[(start + i) % pool.length];
    if (!picked.some((p) => p.pattern === e.pattern && p.pattern !== 'plyo') || pool.length <= moves) picked.push(e);
  }
  const roundSec = picked.length * (workSec + restSec) + 60;
  const rounds = Math.max(2, Math.min(6, Math.floor((minutes * 60) / roundSec)));
  return {
    type: 'interval', title, rounds, workSec, restSec,
    items: picked.map((e) => ({ exerciseId: e.id, sets: 1, seconds: workSec, restSec })),
  };
}

export function blockMinutes(b: Block): number {
  if (b.type === 'interval' || b.type === 'circuit') {
    const per = b.items.length * ((b.workSec ?? 30) + (b.restSec ?? 30));
    return ((b.rounds ?? 1) * per + Math.max(0, (b.rounds ?? 1) - 1) * 60) / 60;
  }
  if (b.type === 'warmup' || b.type === 'cooldown') {
    return b.items.reduce((m, it) => m + (it.seconds ?? 40) / 60, 0) + 0.5;
  }
  return b.items.reduce((m, it) => m + itemMinutes(it), 0);
}

// ---------- day builders ----------

function strengthDay(key: string, tpl: { title: string; slots: Slot[] }, ctx: Ctx, idx: number): PlanDay {
  const { input } = ctx;
  const total = input.minutesPerSession;
  const warm = warmup(ctx, total >= 30 ? 5 : 3, idx);
  const cool = cooldown(ctx, total >= 45 || input.goals.includes('mobility') ? 4 : 3, idx);
  const finisherMin = wantsConditioning(input) && total >= 40 && input.hiit !== 'none' ? 8 : 0;
  let budget = total - blockMinutes(warm) - blockMinutes(cool) - finisherMin;

  const dayUsed = new Set<string>();
  const items: BlockItem[] = [];
  for (const slot of tpl.slots) {
    const ex = pickExercise(slot.pattern, slot.role, ctx, dayUsed);
    if (!ex) continue;
    const item = itemFor(ex, prescription(input, slot.role));
    const m = itemMinutes(item);
    if (m > budget) {
      // try squeezing in with one fewer set before giving up on the slot
      if (item.sets > 2 && itemMinutes({ ...item, sets: item.sets - 1 }) <= budget) item.sets -= 1;
      else if (items.length >= 2) break;
      else if (item.sets > 1) item.sets = Math.max(1, item.sets - 1);
    }
    items.push(item);
    dayUsed.add(ex.id);
    ctx.used.set(ex.id, (ctx.used.get(ex.id) ?? 0) + 1);
    budget -= itemMinutes(item);
    if (budget <= 1) break;
  }

  const blocks: Block[] = [warm, { type: 'strength', title: 'Strength', items }];
  let kind: PlanDay['kind'] = 'strength';
  if (finisherMin) {
    const fin = intervalBlock(ctx, finisherMin, 'Finisher', 3);
    if (fin) { blocks.push(fin); kind = 'mixed'; }
  }
  blocks.push(cool);
  return { key, title: tpl.title, kind, blocks, estMinutes: Math.round(blocks.reduce((m, b) => m + blockMinutes(b), 0)) };
}

function hiitDay(key: string, ctx: Ctx, idx: number): PlanDay {
  const total = ctx.input.minutesPerSession;
  const warm = warmup(ctx, 5, idx + 3);
  const cool = cooldown(ctx, 4, idx + 5);
  const left = total - blockMinutes(warm) - blockMinutes(cool);
  const blocks: Block[] = [warm];
  const moves = ctx.input.level === 'beginner' || ctx.input.conservative ? 4 : 5;
  if (left >= 28) {
    const a = intervalBlock(ctx, left / 2, 'Intervals 1', moves);
    const b = intervalBlock(ctx, left / 2, 'Intervals 2', moves, new Set(a?.items.map((i) => i.exerciseId)));
    if (a) blocks.push(a);
    if (b) blocks.push(b);
  } else {
    const a = intervalBlock(ctx, Math.max(6, left), 'Intervals', moves);
    if (a) blocks.push(a);
  }
  blocks.push(cool);
  return {
    key, title: ctx.input.conservative ? 'Low-Impact Conditioning' : 'HIIT', kind: 'hiit', blocks,
    estMinutes: Math.round(blocks.reduce((m, b) => m + blockMinutes(b), 0)),
  };
}

// ---------- public API ----------

export function generatePlan(input: PlanInput, phase = 1): Plan {
  const seed = (input.seed ?? 1) + phase * 7919;
  const ctx: Ctx = {
    input,
    rand: rng(seed),
    used: new Map(),
    maxLevel: input.conservative ? 1 : LEVEL_NUM[input.level],
  };
  const layout = weekLayout(input.daysPerWeek, wantsConditioning(input), input.hiit);
  const seen = new Map<string, number>();
  const days = layout.map((t, i) => {
    const n = (seen.get(t) ?? 0) + 1;
    seen.set(t, n);
    const key = `d${i + 1}`;
    const day = t === 'hiit' ? hiitDay(key, ctx, i) : strengthDay(key, TEMPLATES[t], ctx, i);
    if (n > 1 && t !== 'hiit') day.title = `${day.title} (2)`;
    if (n > 1 && t === 'hiit') day.title = `${day.title} 2`;
    return day;
  });

  const notes: string[] = [];
  if (input.conservative) notes.push('Gentle mode is on: lighter moves, no jumping, extra rest. Get a doctor\'s OK before training hard.');
  if (input.painAreas.length) notes.push('Moves that load the areas you flagged are left out.');
  if (input.goals.includes('lose_fat')) notes.push('For fat loss, what you eat matters as much as training. Diet tracking is coming in a later version.');
  notes.push(`Each phase runs ${PHASE_WEEKS} weeks. Finish most of your sessions and the app will offer the next level.`);

  return {
    version: 1, level: input.level, phase, weeks: PHASE_WEEKS, createdAt: new Date().toISOString(), input, days, notes,
  };
}

/** After a phase: should we offer the next level? */
export function phaseReview(opts: {
  plan: Plan; sessionsDone: number; painActive: boolean;
}): { complete: boolean; offerLevelUp: boolean; nextLevel: Level | null; message: string } {
  const planned = opts.plan.days.length * opts.plan.weeks;
  const ratio = planned ? opts.sessionsDone / planned : 0;
  const order: Level[] = ['beginner', 'intermediate', 'advanced'];
  const i = order.indexOf(opts.plan.level);
  const next = i < order.length - 1 ? order[i + 1] : null;
  if (ratio < 0.75) {
    return { complete: false, offerLevelUp: false, nextLevel: null, message: `${opts.sessionsDone} of ${planned} sessions done. Finish most of this phase before moving up.` };
  }
  if (opts.painActive) {
    return { complete: true, offerLevelUp: false, nextLevel: null, message: 'Phase done. Staying at this level while something hurts.' };
  }
  if (opts.plan.input.conservative) {
    return { complete: true, offerLevelUp: false, nextLevel: null, message: 'Phase done. Gentle mode stays on until you turn it off in your profile.' };
  }
  return {
    complete: true, offerLevelUp: !!next, nextLevel: next,
    message: next ? `Phase done. Ready for ${next}?` : 'Phase done. Starting a fresh advanced phase.',
  };
}

export function totalPlannedMinutes(plan: Plan): number {
  return plan.days.reduce((m, d) => m + d.estMinutes, 0);
}
