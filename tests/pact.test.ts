import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, countWeek, settle, canRequestPause, localDate, daysLeftInWeek, venmoLink } from '../src/lib/pact';
import { swapOptions } from '../src/lib/swaps';
import { getExercise, hasGear } from '../src/lib/exercises';
import { screeningFlagged, oldEnough } from '../src/lib/screening';

const LA = 'America/Los_Angeles';

test('week starts Monday in the pact time zone', () => {
  // Sunday 11pm LA = Monday 7am UTC
  assert.equal(weekStart(new Date('2026-11-23T07:00:00Z'), LA), '2026-11-16');
  assert.equal(weekStart(new Date('2026-11-23T08:30:00Z'), LA), '2026-11-23');
  assert.equal(weekStart(new Date('2026-11-23T08:30:00Z'), 'Asia/Tokyo'), '2026-11-23');
});

test('midnight boundary: workout at 11:59pm Sunday counts for that week', () => {
  const w = [{ startedAt: '2026-11-23T07:59:00Z', minutes: 40 }]; // Sun 11:59pm LA
  assert.equal(countWeek({ workouts: w, approvedClaimDates: [], tz: LA, week: '2026-11-16' }), 1);
  assert.equal(countWeek({ workouts: w, approvedClaimDates: [], tz: LA, week: '2026-11-23' }), 0);
});

test('one per day cap, minimum length, approved claims count', () => {
  const w = [
    { startedAt: '2026-11-17T15:00:00Z', minutes: 40 },
    { startedAt: '2026-11-17T22:00:00Z', minutes: 30 }, // same LA day
    { startedAt: '2026-11-18T15:00:00Z', minutes: 5 }, // too short
  ];
  assert.equal(countWeek({ workouts: w, approvedClaimDates: ['2026-11-19', '2026-11-17'], tz: LA, week: '2026-11-16' }), 2);
});

test('settle: both hit, one missed, both missed, pause', () => {
  assert.equal(settle(4, 2000, [{ userId: 'a', count: 4, paused: false }, { userId: 'b', count: 5, paused: false }]).outcome, 'both_hit');
  const one = settle(4, 2000, [{ userId: 'a', count: 3, paused: false }, { userId: 'b', count: 4, paused: false }], { a: 'Ryan', b: 'Alex' });
  assert.deepEqual(one.ledger, [{ from: 'a', to: 'b', amountCents: 2000 }]);
  assert.equal(one.summary, 'Ryan owes Alex $20.');
  const both = settle(4, 2000, [{ userId: 'a', count: 1, paused: false }, { userId: 'b', count: 0, paused: false }]);
  assert.equal(both.outcome, 'both_missed'); assert.equal(both.ledger.length, 0);
  const paused = settle(4, 2000, [{ userId: 'a', count: 0, paused: true }, { userId: 'b', count: 4, paused: false }]);
  assert.equal(paused.outcome, 'both_hit');
});

test('pause only before the week or on its first day', () => {
  assert.equal(canRequestPause(new Date('2026-11-22T20:00:00Z'), '2026-11-23', LA), true);
  assert.equal(canRequestPause(new Date('2026-11-23T20:00:00Z'), '2026-11-23', LA), true);
  assert.equal(canRequestPause(new Date('2026-11-24T20:00:00Z'), '2026-11-23', LA), false);
});

test('days left', () => {
  assert.equal(daysLeftInWeek(new Date('2026-11-23T20:00:00Z'), LA), 6); // Monday
  assert.equal(daysLeftInWeek(new Date('2026-11-29T20:00:00Z'), LA), 0); // Sunday
  assert.equal(localDate(new Date('2026-11-23T07:00:00Z'), LA), '2026-11-22');
});

test('venmo link', () => {
  assert.equal(venmoLink('@alex-k', 2000, 'Gym pact'), 'venmo://paycharge?txn=pay&recipients=alex-k&amount=20.00&note=Gym%20pact');
});

test('swaps: same pattern, user gear, different equipment, avoids pain', () => {
  const opts = swapOptions({ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', gear: ['dumbbell', 'bench', 'cable', 'machine', 'bands'], level: 'beginner', painAreas: [] });
  assert.equal(opts.length, 3);
  for (const o of opts) { assert.equal(o.pattern, 'push_h'); assert.ok(hasGear(o, ['dumbbell', 'bench', 'cable', 'machine', 'bands'])); }
  assert.ok(new Set(opts.map((o) => o.gear[0])).size >= 2);
  const home = swapOptions({ exerciseId: 'Barbell_Full_Squat', gear: [], level: 'beginner', painAreas: [] });
  assert.ok(home.length >= 1 && home.every((o) => hasGear(o, [])));
  const knees = swapOptions({ exerciseId: 'Barbell_Full_Squat', gear: [], level: 'beginner', painAreas: ['knee'] });
  assert.ok(knees.every((o) => !o.areas.includes('knee')));
  assert.ok(getExercise('Barbell_Full_Squat'));
});

test('screening and age', () => {
  assert.equal(screeningFlagged({ heart: false, meds: false }), false);
  assert.equal(screeningFlagged({ heart: false, injury: true }), true);
  assert.equal(oldEnough(2010, new Date('2026-11-22')), false);
  assert.equal(oldEnough(1990, new Date('2026-11-22')), true);
  assert.equal(oldEnough(null), null);
});
