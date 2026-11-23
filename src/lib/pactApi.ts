import { DEMO, supabase } from './supabase';
import { countWeek, weekStart } from './pact';

export interface PactMember { userId: string; name: string; venmo: string | null; isMe: boolean }
export interface FeedItem { id: string; userId: string; title: string; startedAt: string; minutes: number; verified: boolean; cheeredByMe: boolean; cheers: number; sets: number; exercises: number }
export interface LedgerRow { id: string; weekStart: string; from: string; to: string; amountCents: number; paidAt: string | null; receivedAt: string | null }
export interface RequestRow { id: string; userId: string; status: 'pending' | 'approved' | 'denied'; day?: string; weekStart?: string; note?: string | null }

export interface PactState {
  pact: { id: string; goal: number; stakeCents: number; tz: string; inviteCode: string; status: 'pending' | 'active' | 'ended'; startedWeek: string | null };
  me: PactMember;
  partner: PactMember | null;
  thisWeek: string;
  counts: Record<string, number>;
  lastResult: { weekStart: string; outcome: string; members: { user_id: string; count: number; paused: boolean; hit: boolean }[] } | null;
  ledger: LedgerRow[];
  proofs: RequestRow[];
  pauses: RequestRow[];
  feed: FeedItem[];
}

export async function loadPact(): Promise<PactState | null> {
  if (DEMO) return demoPact();
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return null;
  const { data: mine } = await supabase.from('pact_members')
    .select('pact_id, pacts!inner(*)').eq('user_id', uid).in('pacts.status', ['pending', 'active']).maybeSingle();
  if (!mine) return null;
  const p = (mine as any).pacts;
  const [{ data: members }, { data: weeks }, { data: ledger }, { data: proofs }, { data: pauses }] = await Promise.all([
    supabase.from('pact_members').select('user_id, joined_at').eq('pact_id', p.id),
    supabase.from('pact_weeks').select('*').eq('pact_id', p.id).order('week_start', { ascending: false }).limit(1),
    supabase.from('ledger_entries').select('*').eq('pact_id', p.id).order('week_start', { ascending: false }).limit(20),
    supabase.from('proof_requests').select('*').eq('pact_id', p.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('pause_requests').select('*').eq('pact_id', p.id).order('created_at', { ascending: false }).limit(20),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase.from('profiles').select('id, display_name, venmo_handle').in('id', ids);
  const mk = (id: string): PactMember => {
    const pr = profiles?.find((x) => x.id === id);
    return { userId: id, name: id === uid ? 'You' : pr?.display_name ?? 'Partner', venmo: pr?.venmo_handle ?? null, isMe: id === uid };
  };
  const partnerId = ids.find((i) => i !== uid) ?? null;
  const thisWeek = weekStart(new Date(), p.tz);
  const since = new Date(Date.now() - 9 * 86_400_000).toISOString();
  const { data: ws } = await supabase.from('workouts')
    .select('id, user_id, title, started_at, ended_at, verified_at_gym, reactions(user_id), workout_sets(count), workout_exercises(count)')
    .in('user_id', ids).gte('started_at', since).order('started_at', { ascending: false });
  const approved = (proofs ?? []).filter((x) => x.status === 'approved');
  const counts: Record<string, number> = {};
  for (const id of ids) {
    counts[id] = countWeek({
      workouts: (ws ?? []).filter((w) => w.user_id === id).map((w) => ({ startedAt: w.started_at, minutes: (new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 60000 })),
      approvedClaimDates: approved.filter((x) => x.user_id === id).map((x) => x.day),
      tz: p.tz, week: thisWeek,
    });
  }
  const last = weeks?.[0];
  return {
    pact: { id: p.id, goal: p.goal, stakeCents: p.stake_cents, tz: p.tz, inviteCode: p.invite_code, status: p.status, startedWeek: p.started_week },
    me: mk(uid), partner: partnerId ? mk(partnerId) : null, thisWeek, counts,
    lastResult: last ? { weekStart: last.week_start, outcome: last.result.outcome, members: last.result.members } : null,
    ledger: (ledger ?? []).map((l) => ({ id: l.id, weekStart: l.week_start, from: l.from_user, to: l.to_user, amountCents: l.amount_cents, paidAt: l.paid_at, receivedAt: l.received_at })),
    proofs: (proofs ?? []).map((x) => ({ id: x.id, userId: x.user_id, status: x.status, day: x.day, note: x.note })),
    pauses: (pauses ?? []).map((x) => ({ id: x.id, userId: x.user_id, status: x.status, weekStart: x.week_start })),
    feed: (ws ?? []).map((w: any) => ({
      id: w.id, userId: w.user_id, title: w.title, startedAt: w.started_at,
      minutes: Math.round((new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 60000),
      verified: w.verified_at_gym, cheers: w.reactions?.length ?? 0, cheeredByMe: !!w.reactions?.some((r: any) => r.user_id === uid),
      sets: w.workout_sets?.[0]?.count ?? 0, exercises: w.workout_exercises?.[0]?.count ?? 0,
    })),
  };
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  if (DEMO) return null;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

export const pactActions = {
  create: (goal: number, stakeCents: number, tz: string) => rpc('create_pact', { p_goal: goal, p_stake_cents: stakeCents, p_tz: tz }),
  join: (code: string) => rpc('join_pact', { p_code: code }),
  end: (id: string) => rpc('end_pact', { p_pact: id }),
  requestProof: (pact: string, day: string, note: string) => rpc('request_proof', { p_pact: pact, p_day: day, p_note: note }),
  decideProof: (id: string, approve: boolean) => rpc('decide_proof', { p_id: id, p_approve: approve }),
  requestPause: (pact: string, week: string) => rpc('request_pause', { p_pact: pact, p_week: week }),
  decidePause: (id: string, approve: boolean) => rpc('decide_pause', { p_id: id, p_approve: approve }),
  markPaid: (id: string) => rpc('mark_paid', { p_id: id }),
  markReceived: (id: string) => rpc('mark_received', { p_id: id }),
  cheer: async (workoutId: string, on: boolean) => {
    if (DEMO) return;
    const { data } = await supabase.auth.getSession();
    const uid = data.session!.user.id;
    const { error } = on
      ? await supabase.from('reactions').insert({ workout_id: workoutId, user_id: uid })
      : await supabase.from('reactions').delete().eq('workout_id', workoutId).eq('user_id', uid);
    if (error) throw error;
  },
};

function demoPact(): PactState {
  const now = Date.now();
  const iso = (h: number) => new Date(now - h * 3600_000).toISOString();
  return {
    pact: { id: 'demo', goal: 4, stakeCents: 2000, tz: 'America/Los_Angeles', inviteCode: 'DEMO42', status: 'active', startedWeek: '2026-11-16' },
    me: { userId: 'me', name: 'You', venmo: null, isMe: true },
    partner: { userId: 'alex', name: 'Alex', venmo: '@alex', isMe: false },
    thisWeek: weekStart(new Date(), 'America/Los_Angeles'),
    counts: { me: 2, alex: 3 },
    lastResult: { weekStart: '2026-11-16', outcome: 'one_missed', members: [{ user_id: 'me', count: 4, paused: false, hit: true }, { user_id: 'alex', count: 3, paused: false, hit: false }] },
    ledger: [{ id: 'l1', weekStart: '2026-11-16', from: 'alex', to: 'me', amountCents: 2000, paidAt: null, receivedAt: null }],
    proofs: [], pauses: [],
    feed: [{ id: 'f1', userId: 'alex', title: 'Push', startedAt: iso(2), minutes: 52, verified: true, cheeredByMe: false, cheers: 0, sets: 18, exercises: 5 }],
  };
}
