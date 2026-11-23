/**
 * Offline-first: everything is saved on the phone first, then pushed here.
 * Safe to call any time; failures are retried on the next call.
 */
import { DEMO, supabase } from './supabase';
import { useStore, type WorkoutRecord } from '../state/store';
import { screeningFlagged } from './screening';
import { randomUUID } from 'expo-crypto';

export const TERMS_VERSION = '2026-11-draft';

async function userId(): Promise<string | null> {
  if (DEMO) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function pushOnboarding(): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const { profile, answers, plan } = useStore.getState();
  const errs = await Promise.all([
    supabase.from('profiles').update({
      display_name: profile.displayName || 'Me', timezone: profile.timezone, venmo_handle: profile.venmo || null,
    }).eq('id', uid),
    supabase.from('profile_private').upsert({
      user_id: uid, birth_year: profile.birthYear, height_cm: profile.heightCm, weight_kg: profile.weightKg,
      sex: profile.sex, unit: profile.unit, level: profile.level, conservative: profile.conservative,
      onboarded_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }),
    supabase.from('questionnaires').upsert({
      user_id: uid, goals: answers.goals, diet_change: answers.dietChange, diet_notes: answers.dietNotes || null,
      days_per_week: answers.daysPerWeek, minutes: answers.minutes, location: answers.location, gear: answers.gear,
      hiit: answers.hiit, updated_at: new Date().toISOString(),
    }),
    supabase.from('screenings').upsert({ user_id: uid, answers: answers.screening, flagged: screeningFlagged(answers.screening) }),
  ]);
  const bad = errs.find((r) => r.error);
  if (bad?.error) throw bad.error;
  if (plan) await pushPlan();
}

export async function pushConsents(): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const kinds = ['terms', 'privacy', 'not_medical_advice', 'age_18'];
  const { error } = await supabase.from('consents').insert(kinds.map((kind) => ({ user_id: uid, kind, version: TERMS_VERSION })));
  if (error) throw error;
}

export async function pushPlan(): Promise<void> {
  const uid = await userId();
  const { plan } = useStore.getState();
  if (!uid || !plan) return;
  await supabase.from('plans').update({ active: false }).eq('user_id', uid).eq('active', true);
  const { error } = await supabase.from('plans').insert({ user_id: uid, phase: plan.phase, level: plan.level, plan, active: true });
  if (error) throw error;
}

export async function pushPain(): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const { painAreas } = useStore.getState();
  const { data } = await supabase.from('pain_flags').select('id, area').eq('user_id', uid).is('cleared_at', null);
  const open = data ?? [];
  const toClear = open.filter((f) => !painAreas.includes(f.area));
  const toAdd = painAreas.filter((a) => !open.some((f) => f.area === a));
  if (toClear.length) await supabase.from('pain_flags').update({ cleared_at: new Date().toISOString() }).in('id', toClear.map((f) => f.id));
  if (toAdd.length) await supabase.from('pain_flags').insert(toAdd.map((area) => ({ user_id: uid, area })));
}

async function pushWorkout(uid: string, w: WorkoutRecord): Promise<void> {
  const { error: e1 } = await supabase.from('workouts').upsert({
    id: w.id, user_id: uid, title: w.title, plan_day_key: w.planDayKey, started_at: w.startedAt,
    ended_at: w.endedAt, verified_at_gym: w.verifiedAtGym, effort: w.effort,
  });
  if (e1) throw e1;
  if (w.exercises.length) {
    const { error: e2 } = await supabase.from('workout_exercises').upsert(w.exercises.map((e, i) => ({
      id: e.id, workout_id: w.id, user_id: uid, exercise_id: e.exerciseId, position: i,
      rep_min: e.repRange?.[0] ?? null, rep_max: e.repRange?.[1] ?? null, target_seconds: e.targetSeconds,
      effort: e.effort, swapped_from: e.swappedFrom,
    })));
    if (e2) throw e2;
    const sets = w.exercises.flatMap((e) => e.sets.map((s, idx) => ({
      id: (s as { id?: string }).id ?? uuidFor(e.id, idx), workout_exercise_id: e.id, workout_id: w.id, user_id: uid,
      idx, kind: s.kind, weight: s.weight, unit: w.unit, reps: s.reps, seconds: s.seconds, done: s.done,
    })));
    if (sets.length) {
      const { error: e3 } = await supabase.from('workout_sets').upsert(sets);
      if (e3) throw e3;
    }
  }
}

/** Stable id per set so re-syncing never duplicates rows. */
function uuidFor(exerciseRowId: string, idx: number): string {
  const hex = (idx + 1).toString(16).padStart(12, '0');
  return exerciseRowId.slice(0, 24) + hex;
}

let syncing = false;
export async function syncWorkouts(): Promise<number> {
  if (syncing) return 0;
  const uid = await userId();
  if (!uid) return 0;
  syncing = true;
  let n = 0;
  try {
    for (const w of useStore.getState().workouts.filter((x) => !x.synced)) {
      try {
        await pushWorkout(uid, w);
        useStore.setState((s) => ({ workouts: s.workouts.map((x) => (x.id === w.id ? { ...x, synced: true } : x)) }));
        n++;
      } catch {
        break; // offline or server error — try again later
      }
    }
  } finally {
    syncing = false;
  }
  return n;
}

/** On a new phone: pull the user's saved setup and history from the server. */
export async function restoreFromServer(): Promise<boolean> {
  const uid = await userId();
  if (!uid) return false;
  const [{ data: priv }, { data: prof }, { data: q }, { data: sc }, { data: plan }, { data: pains }] = await Promise.all([
    supabase.from('profile_private').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('questionnaires').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('screenings').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('plans').select('*').eq('user_id', uid).eq('active', true).maybeSingle(),
    supabase.from('pain_flags').select('area').eq('user_id', uid).is('cleared_at', null),
  ]);
  if (!priv?.onboarded_at) return false;
  const { data: ws } = await supabase.from('workouts')
    .select('*, workout_exercises(*, workout_sets(*))').eq('user_id', uid).order('started_at', { ascending: false }).limit(300);
  const st = useStore.getState();
  useStore.setState({
    onboarded: true,
    profile: {
      ...st.profile, displayName: prof?.display_name ?? '', timezone: prof?.timezone ?? st.profile.timezone,
      venmo: prof?.venmo_handle ?? '', birthYear: priv.birth_year, heightCm: priv.height_cm, weightKg: priv.weight_kg,
      sex: priv.sex, unit: priv.unit, level: priv.level, conservative: priv.conservative,
    },
    answers: q ? {
      ...st.answers, goals: q.goals, dietChange: q.diet_change, dietNotes: q.diet_notes ?? '', daysPerWeek: q.days_per_week,
      minutes: q.minutes, location: q.location, gear: q.gear, hiit: q.hiit, screening: sc?.answers ?? {}, wantsPlan: !!plan,
    } : st.answers,
    plan: plan?.plan ?? null,
    planStartedAt: plan?.created_at ?? null,
    painAreas: (pains ?? []).map((p: { area: string }) => p.area) as never,
    workouts: (ws ?? []).map((w: any): WorkoutRecord => ({
      id: w.id, title: w.title, planDayKey: w.plan_day_key, startedAt: w.started_at, endedAt: w.ended_at,
      verifiedAtGym: w.verified_at_gym, effort: w.effort, unit: w.workout_exercises?.[0]?.workout_sets?.[0]?.unit ?? priv.unit,
      intervals: [], warmupIds: [], cooldownIds: [], synced: true,
      exercises: (w.workout_exercises ?? []).sort((a: any, b: any) => a.position - b.position).map((e: any) => ({
        id: e.id, exerciseId: e.exercise_id, repRange: e.rep_min != null ? [e.rep_min, e.rep_max] : null,
        targetSeconds: e.target_seconds, restSec: 90, effort: e.effort, swappedFrom: e.swapped_from,
        sets: (e.workout_sets ?? []).sort((a: any, b: any) => a.idx - b.idx).map((s: any) => ({
          kind: s.kind, weight: s.weight == null ? null : Number(s.weight), reps: s.reps, seconds: s.seconds, done: s.done,
        })),
      })),
    })),
  });
  return true;
}

export function newId(): string {
  return randomUUID();
}
