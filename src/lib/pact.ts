/**
 * Partner pact rules. The app only keeps score — it never moves money.
 * Mirrors the SQL in supabase/migrations (settle_pact_week). Keep them in sync.
 */

/** YYYY-MM-DD of `d` as seen in time zone `tz`. */
export function localDate(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Monday-based week start (YYYY-MM-DD) for the local date of `d` in `tz`. */
export function weekStart(d: Date, tz: string): string {
  const ymd = localDate(d, tz);
  const [y, m, day] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return addDays(ymd, -back);
}

export function weekEnd(start: string): string {
  return addDays(start, 6);
}

export function daysLeftInWeek(now: Date, tz: string): number {
  const start = weekStart(now, tz);
  const today = localDate(now, tz);
  const [a, b] = [start, today].map((s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return 6 - Math.round((b - a) / 86_400_000);
}

export const MIN_WORKOUT_MINUTES = 10;

export interface CountedWorkout {
  startedAt: string; // ISO
  minutes: number;
}

/**
 * Workouts that count toward the weekly goal: at least 10 minutes,
 * or a partner-approved claim. At most one per local day.
 */
export function countWeek(opts: {
  workouts: CountedWorkout[];
  approvedClaimDates: string[]; // YYYY-MM-DD local dates the partner approved
  tz: string;
  week: string; // week start
}): number {
  const end = weekEnd(opts.week);
  const days = new Set<string>();
  for (const w of opts.workouts) {
    if (w.minutes < MIN_WORKOUT_MINUTES) continue;
    const day = localDate(new Date(w.startedAt), opts.tz);
    if (day >= opts.week && day <= end) days.add(day);
  }
  for (const day of opts.approvedClaimDates) if (day >= opts.week && day <= end) days.add(day);
  return days.size;
}

export interface MemberWeek {
  userId: string;
  count: number;
  paused: boolean;
}

export interface Settlement {
  hit: Record<string, boolean>;
  outcome: 'both_hit' | 'one_missed' | 'both_missed';
  ledger: { from: string; to: string; amountCents: number }[];
  summary: string;
}

export function settle(goal: number, stakeCents: number, members: MemberWeek[], names: Record<string, string> = {}): Settlement {
  if (members.length !== 2) throw new Error('A pact has exactly two people');
  const hit: Record<string, boolean> = {};
  for (const m of members) hit[m.userId] = m.paused || m.count >= goal;
  const [a, b] = members;
  const n = (id: string) => names[id] ?? 'Partner';
  if (hit[a.userId] && hit[b.userId]) {
    return { hit, outcome: 'both_hit', ledger: [], summary: 'You both hit your goal. Nobody owes anything.' };
  }
  if (!hit[a.userId] && !hit[b.userId]) {
    return { hit, outcome: 'both_missed', ledger: [], summary: 'Both missed. Call it even.' };
  }
  const loser = hit[a.userId] ? b : a;
  const winner = loser === a ? b : a;
  return {
    hit, outcome: 'one_missed',
    ledger: [{ from: loser.userId, to: winner.userId, amountCents: stakeCents }],
    summary: `${n(loser.userId)} owes ${n(winner.userId)} $${(stakeCents / 100).toFixed(2).replace(/\.00$/, '')}.`,
  };
}

/** Pause rule: ask before the week starts or within its first 24 hours. */
export function canRequestPause(now: Date, week: string, tz: string): boolean {
  const today = localDate(now, tz);
  if (today < week) return true;
  return today === week; // the first local day of the week
}

export function venmoLink(handle: string, amountCents: number, note: string): string {
  const h = handle.replace(/^@/, '');
  return `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(h)}&amount=${(amountCents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
}
