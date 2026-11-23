import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, phaseReview, weekLayout, blockMinutes } from '../src/lib/plan';
import { getExercise, hasGear, FULL_GYM, STAPLES, WARMUP_MOVES, COOLDOWN_MOVES, LOW_IMPACT_CONDITIONING } from '../src/lib/exercises';
import type { PlanInput, Gear, Level, Goal } from '../src/lib/types';

const base: PlanInput = {
  goals: ['build_muscle'], level: 'beginner', daysPerWeek: 3, minutesPerSession: 45,
  gear: [], hiit: 'some', conservative: false, painAreas: [], seed: 42,
};

function allItems(p: ReturnType<typeof generatePlan>) {
  return p.days.flatMap((d) => d.blocks.flatMap((b) => b.items));
}

test('every staple / warm-up / cool-down id exists', () => {
  const ids = [...Object.values(STAPLES).flat(), ...WARMUP_MOVES, ...COOLDOWN_MOVES, ...LOW_IMPACT_CONDITIONING];
  for (const id of ids) assert.ok(getExercise(id!), `missing exercise ${id}`);
});

test('same input + seed gives the same plan', () => {
  const a = generatePlan(base); const b = generatePlan(base);
  assert.deepEqual(a.days, b.days);
});

test('home, bodyweight only: only bodyweight moves, still a full plan', () => {
  const p = generatePlan({ ...base, gear: [] });
  assert.equal(p.days.length, 3);
  for (const it of allItems(p)) {
    const e = getExercise(it.exerciseId)!;
    assert.ok(hasGear(e, []), `${e.name} needs ${e.gear}`);
  }
  const strength = p.days.find((d) => d.kind !== 'hiit')!.blocks.find((b) => b.type === 'strength')!;
  assert.ok(strength.items.length >= 4, 'at least 4 strength moves');
});

test('bands only plan uses bands', () => {
  const p = generatePlan({ ...base, gear: ['bands'], daysPerWeek: 4, hiit: 'none' });
  const usesBands = allItems(p).some((it) => getExercise(it.exerciseId)!.gear.includes('bands'));
  assert.ok(usesBands);
  for (const it of allItems(p)) assert.ok(hasGear(getExercise(it.exerciseId)!, ['bands']));
});

test('every combination respects gear, time, level and has no duplicates in a day', () => {
  const gears: Gear[][] = [[], ['bands'], ['dumbbell', 'bench'], ['kettlebell'], FULL_GYM, ['dumbbell', 'bands', 'pullup_bar']];
  const levels: Level[] = ['beginner', 'intermediate', 'advanced'];
  const goals: Goal[][] = [['build_muscle'], ['lose_fat'], ['get_stronger'], ['endurance', 'mobility'], ['general_health']];
  let n = 0;
  for (const gear of gears) for (const level of levels) for (const g of goals)
    for (const days of [2, 3, 4, 5, 6]) for (const minutes of [15, 20, 30, 45, 60, 90]) for (const hiit of ['none', 'some', 'lots'] as const) {
      const p = generatePlan({ ...base, gear, level, goals: g, daysPerWeek: days, minutesPerSession: minutes, hiit, seed: n++ });
      assert.equal(p.days.length, days);
      for (const d of p.days) {
        const ids = d.blocks.filter((b) => b.type === 'strength').flatMap((b) => b.items.map((i) => i.exerciseId));
        assert.equal(new Set(ids).size, ids.length, `duplicate in ${d.title}`);
        assert.ok(d.blocks.some((b) => b.type === 'strength' || b.type === 'interval'), `${d.title} has no main work`);
        // within 35% (+5 min) of the time asked for
        assert.ok(d.estMinutes <= minutes * 1.35 + 5, `${d.title} ${d.estMinutes} min > ${minutes}`);
        for (const b of d.blocks) for (const it of b.items) {
          const e = getExercise(it.exerciseId)!;
          assert.ok(hasGear(e, gear), `${e.name} gear`);
          if (b.type === 'strength') {
            const lv = { beginner: 1, intermediate: 2, advanced: 3 }[level];
            assert.ok(e.level <= lv || e.id === 'Barbell_Deadlift', `${e.name} too advanced for ${level}`);
            assert.notEqual(e.category, 'olympic weightlifting');
          }
        }
      }
    }
  assert.ok(n > 1000);
});

test('hiit none means no interval blocks', () => {
  const p = generatePlan({ ...base, goals: ['lose_fat'], hiit: 'none', daysPerWeek: 4 });
  assert.ok(!p.days.some((d) => d.blocks.some((b) => b.type === 'interval')));
});

test('hiit lots adds HIIT days', () => {
  const p = generatePlan({ ...base, hiit: 'lots', daysPerWeek: 4 });
  assert.equal(p.days.filter((d) => d.kind === 'hiit').length, 2);
});

test('gentle mode: level-1 moves only, no jumping, max 2 sets, longer rest', () => {
  const p = generatePlan({ ...base, conservative: true, level: 'advanced', gear: FULL_GYM, goals: ['lose_fat'], hiit: 'lots' });
  for (const d of p.days) for (const b of d.blocks) for (const it of b.items) {
    const e = getExercise(it.exerciseId)!;
    assert.notEqual(e.pattern, 'plyo', `${e.name} is a jump`);
    if (b.type === 'strength') {
      assert.equal(e.level, 1, `${e.name}`);
      assert.ok(it.sets <= 2);
    }
    if (b.type === 'interval') assert.equal(b.workSec, 20);
  }
});

test('knee pain: nothing that loads the knee', () => {
  const p = generatePlan({ ...base, painAreas: ['knee'], gear: FULL_GYM, hiit: 'lots' });
  for (const it of allItems(p)) assert.ok(!getExercise(it.exerciseId)!.areas.includes('knee'), it.exerciseId);
});

test('strength goal uses low reps on main lifts for non-beginners', () => {
  const p = generatePlan({ ...base, goals: ['get_stronger'], level: 'intermediate', gear: FULL_GYM, hiit: 'none' });
  const first = p.days[0].blocks.find((b) => b.type === 'strength')!.items[0];
  assert.deepEqual(first.reps, [5, 8]);
});

test('full gym beginner picks recognizable staples', () => {
  const p = generatePlan({ ...base, gear: FULL_GYM, hiit: 'none' });
  const names = allItems(p).map((i) => getExercise(i.exerciseId)!.name);
  const staples = new Set(Object.values(STAPLES).flat());
  const hits = allItems(p).filter((i) => staples.has(i.exerciseId)).length;
  assert.ok(hits / names.length > 0.4, names.join(', '));
});

test('week layouts', () => {
  assert.deepEqual(weekLayout(4, false, 'some'), ['upper_a', 'lower_a', 'upper_b', 'lower_b']);
  assert.ok(weekLayout(3, true, 'some').includes('hiit'));
  assert.equal(weekLayout(9, false, 'none').length, 6);
});

test('interval block minutes add up', () => {
  assert.equal(blockMinutes({ type: 'interval', title: '', rounds: 3, workSec: 30, restSec: 30, items: [1, 2, 3, 4].map(() => ({ exerciseId: 'x', sets: 1, restSec: 30 })) }), (3 * 240 + 120) / 60);
});

test('phase review: level up only when earned', () => {
  const plan = generatePlan(base);
  const planned = plan.days.length * plan.weeks;
  assert.equal(phaseReview({ plan, sessionsDone: Math.floor(planned * 0.5), painActive: false }).offerLevelUp, false);
  const ok = phaseReview({ plan, sessionsDone: planned, painActive: false });
  assert.equal(ok.offerLevelUp, true); assert.equal(ok.nextLevel, 'intermediate');
  assert.equal(phaseReview({ plan, sessionsDone: planned, painActive: true }).offerLevelUp, false);
  const gentle = generatePlan({ ...base, conservative: true });
  assert.equal(phaseReview({ plan: gentle, sessionsDone: 99, painActive: false }).offerLevelUp, false);
  const adv = generatePlan({ ...base, level: 'advanced' });
  assert.equal(phaseReview({ plan: adv, sessionsDone: 99, painActive: false }).nextLevel, null);
});

test('phase 2 changes exercises a bit', () => {
  const a = generatePlan({ ...base, gear: FULL_GYM }, 1); const b = generatePlan({ ...base, gear: FULL_GYM }, 2);
  assert.notDeepEqual(allItems(a).map((i) => i.exerciseId), allItems(b).map((i) => i.exerciseId));
});

test('two HIIT blocks in one day use different moves when possible', () => {
  const p = generatePlan({ ...base, hiit: 'lots', minutesPerSession: 45, gear: ['bands', 'dumbbell'] });
  for (const d of p.days.filter((x) => x.kind === 'hiit')) {
    const blocks = d.blocks.filter((b) => b.type === 'interval');
    if (blocks.length === 2) {
      const a = new Set(blocks[0].items.map((i) => i.exerciseId));
      assert.ok(blocks[1].items.every((i) => !a.has(i.exerciseId)), d.title);
    }
  }
});
