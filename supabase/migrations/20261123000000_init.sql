-- Gym app v1 schema. Paste into Supabase → SQL Editor and run once.
-- Every table has Row Level Security. Access is granted table by table to signed-in users only.

create extension if not exists pgcrypto;

-- ============ tables ============

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Me' check (char_length(display_name) <= 40),
  timezone text not null default 'America/Los_Angeles',
  venmo_handle text check (venmo_handle is null or venmo_handle ~ '^@?[A-Za-z0-9_-]{1,30}$'),
  created_at timestamptz not null default now()
);

-- private to the owner: body stats and training settings
create table public.profile_private (
  user_id uuid primary key references auth.users on delete cascade,
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric(5,1) check (height_cm between 50 and 260),
  weight_kg numeric(5,1) check (weight_kg between 20 and 400),
  sex text check (sex in ('female','male','other')),
  unit text not null default 'lb' check (unit in ('lb','kg')),
  level text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  conservative boolean not null default false,
  onboarded_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.questionnaires (
  user_id uuid primary key references auth.users on delete cascade,
  goals text[] not null default '{}',
  diet_change text check (diet_change in ('no','maybe','yes')),
  diet_notes text check (char_length(diet_notes) <= 500),
  days_per_week int check (days_per_week between 2 and 6),
  minutes int check (minutes between 10 and 120),
  location text check (location in ('home','gym','both')),
  gear text[] not null default '{}',
  hiit text check (hiit in ('none','some','lots')),
  updated_at timestamptz not null default now()
);

create table public.screenings (
  user_id uuid primary key references auth.users on delete cascade,
  answers jsonb not null,
  flagged boolean not null,
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('terms','privacy','not_medical_advice','age_18')),
  version text not null,
  accepted_at timestamptz not null default now()
);

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) <= 80),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  phase int not null default 1,
  level text not null,
  plan jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index plans_one_active on public.plans (user_id) where active;

create table public.workouts (
  id uuid primary key, -- made on the phone so offline saves sync safely
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) <= 80),
  plan_day_key text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  verified_at_gym boolean not null default false,
  effort text check (effort in ('easy','good','hard','max')),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  check (ended_at >= started_at and ended_at - started_at < interval '6 hours')
);
create index workouts_user_started on public.workouts (user_id, started_at desc);

create table public.workout_exercises (
  id uuid primary key,
  workout_id uuid not null references public.workouts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  position int not null,
  rep_min int, rep_max int, target_seconds int,
  effort text check (effort in ('easy','good','hard','max')),
  swapped_from text
);
create index workout_exercises_user_ex on public.workout_exercises (user_id, exercise_id);

create table public.workout_sets (
  id uuid primary key,
  workout_exercise_id uuid not null references public.workout_exercises on delete cascade,
  workout_id uuid not null references public.workouts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  idx int not null,
  kind text not null default 'work' check (kind in ('warmup','work')),
  weight numeric(6,2) check (weight is null or weight between 0 and 2000),
  unit text not null default 'lb' check (unit in ('lb','kg')),
  reps int check (reps is null or reps between 0 and 500),
  seconds int check (seconds is null or seconds between 0 and 7200),
  done boolean not null default false
);

create table public.pain_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  area text not null check (area in ('shoulder','elbow','wrist','chest','lower_back','hip','knee','ankle')),
  created_at timestamptz not null default now(),
  cleared_at timestamptz
);

create table public.pacts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users on delete cascade,
  goal int not null default 4 check (goal between 1 and 7),
  stake_cents int not null default 2000 check (stake_cents between 0 and 100000),
  tz text not null default 'America/Los_Angeles',
  invite_code text not null unique,
  status text not null default 'pending' check (status in ('pending','active','ended')),
  started_week date,
  created_at timestamptz not null default now()
);

create table public.pact_members (
  pact_id uuid not null references public.pacts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pact_id, user_id)
);
create index pact_members_user on public.pact_members (user_id);

create table public.pact_weeks (
  pact_id uuid not null references public.pacts on delete cascade,
  week_start date not null,
  result jsonb not null,
  settled_at timestamptz not null default now(),
  primary key (pact_id, week_start)
);

create table public.proof_requests (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references public.pacts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  note text check (char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pact_id, user_id, day)
);

-- no reason column on purpose: partners only ever see "pause requested"
create table public.pause_requests (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references public.pacts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pact_id, user_id, week_start)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references public.pacts on delete cascade,
  week_start date not null,
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  paid_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reactions (
  workout_id uuid not null references public.workouts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null default 'cheer' check (kind in ('cheer')),
  created_at timestamptz not null default now(),
  primary key (workout_id, user_id)
);

-- ============ helpers ============

-- true when the signed-in user and `other` are in an active pact together
create or replace function public.is_partner(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pact_members a
    join pact_members b on b.pact_id = a.pact_id
    join pacts p on p.id = a.pact_id
    where a.user_id = auth.uid() and b.user_id = other and other <> auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_pact_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pact_members where pact_id = p and user_id = auth.uid());
$$;

-- Monday of the week containing `ts`, in time zone `tz`
create or replace function public.week_start_for(ts timestamptz, tz text) returns date
language sql immutable as $$
  select date_trunc('week', (ts at time zone tz))::date;
$$;

-- new users get a profile row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  insert into profile_private (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ pact rules (mirror src/lib/pact.ts) ============

create or replace function public.pact_week_count(p_pact uuid, p_user uuid, p_week date) returns int
language sql stable security definer set search_path = public as $$
  with tz as (select tz from pacts where id = p_pact),
  days as (
    select (w.started_at at time zone (select tz from tz))::date as d
    from workouts w
    where w.user_id = p_user
      and w.ended_at - w.started_at >= interval '10 minutes'
    union
    select pr.day from proof_requests pr
    where pr.pact_id = p_pact and pr.user_id = p_user and pr.status = 'approved'
  )
  select count(distinct d)::int from days where d between p_week and p_week + 6;
$$;

-- (Re)compute one week. Safe to run again: unpaid, unreceived IOUs for the week are replaced.
-- Once the winner marks an IOU received, that week is locked.
create or replace function public.settle_pact_week(p_pact uuid, p_week date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pk pacts%rowtype;
  m record;
  members uuid[];
  counts int[] := '{}';
  paused boolean[] := '{}';
  hit boolean[] := '{}';
  res jsonb;
  outcome text;
begin
  select * into pk from pacts where id = p_pact;
  if pk.id is null then raise exception 'no pact'; end if;
  if exists (select 1 from ledger_entries where pact_id = p_pact and week_start = p_week and received_at is not null) then
    return (select result from pact_weeks where pact_id = p_pact and week_start = p_week);
  end if;
  select array_agg(user_id order by joined_at, user_id) into members from pact_members where pact_id = p_pact;
  if coalesce(array_length(members, 1), 0) <> 2 then return null; end if;
  for i in 1..2 loop
    counts := counts || pact_week_count(p_pact, members[i], p_week);
    paused := paused || exists (select 1 from pause_requests where pact_id = p_pact and user_id = members[i] and week_start = p_week and status = 'approved');
    hit := hit || (paused[i] or counts[i] >= pk.goal);
  end loop;

  delete from ledger_entries where pact_id = p_pact and week_start = p_week and received_at is null;
  if hit[1] and hit[2] then outcome := 'both_hit';
  elsif not hit[1] and not hit[2] then outcome := 'both_missed';
  else
    outcome := 'one_missed';
    insert into ledger_entries (pact_id, week_start, from_user, to_user, amount_cents)
    values (p_pact, p_week,
      case when hit[1] then members[2] else members[1] end,
      case when hit[1] then members[1] else members[2] end,
      pk.stake_cents);
  end if;

  res := jsonb_build_object(
    'outcome', outcome, 'goal', pk.goal, 'stake_cents', pk.stake_cents,
    'members', jsonb_build_array(
      jsonb_build_object('user_id', members[1], 'count', counts[1], 'paused', paused[1], 'hit', hit[1]),
      jsonb_build_object('user_id', members[2], 'count', counts[2], 'paused', paused[2], 'hit', hit[2])));
  insert into pact_weeks (pact_id, week_start, result) values (p_pact, p_week, res)
  on conflict (pact_id, week_start) do update set result = excluded.result, settled_at = now();
  return res;
end $$;

-- Settle every finished week that hasn't been settled. Run hourly by pg_cron.
create or replace function public.settle_due_pacts() returns int
language plpgsql security definer set search_path = public as $$
declare
  p record;
  wk date;
  n int := 0;
begin
  for p in select * from pacts where status = 'active' and started_week is not null loop
    wk := p.started_week;
    while wk + 7 <= (now() at time zone p.tz)::date loop
      if not exists (select 1 from pact_weeks where pact_id = p.id and week_start = wk) then
        perform settle_pact_week(p.id, wk);
        n := n + 1;
      end if;
      wk := wk + 7;
    end loop;
  end loop;
  return n;
end $$;

-- re-settle a past week after a late approval
create or replace function public.resettle_if_done(p_pact uuid, p_week date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pact_weeks where pact_id = p_pact and week_start = p_week) then
    perform settle_pact_week(p_pact, p_week);
  end if;
end $$;

-- ============ actions the app calls ============

create or replace function public.create_pact(p_goal int, p_stake_cents int, p_tz text) returns pacts
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  code text;
  pk pacts;
begin
  if me is null then raise exception 'sign in first'; end if;
  if exists (select 1 from pact_members pm join pacts p on p.id = pm.pact_id where pm.user_id = me and p.status in ('pending','active')) then
    raise exception 'You are already in a pact';
  end if;
  perform 1 from pg_timezone_names where name = p_tz;
  if not found then raise exception 'bad time zone'; end if;
  loop
    code := substr(translate(upper(encode(gen_random_bytes(8), 'base64')), '+/=0O1IL', ''), 1, 6);
    exit when char_length(code) = 6 and not exists (select 1 from pacts where invite_code = code);
  end loop;
  insert into pacts (created_by, goal, stake_cents, tz, invite_code) values (me, p_goal, p_stake_cents, p_tz, code) returning * into pk;
  insert into pact_members (pact_id, user_id) values (pk.id, me);
  return pk;
end $$;

create or replace function public.join_pact(p_code text) returns pacts
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pk pacts;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into pk from pacts where invite_code = upper(trim(p_code)) and status = 'pending' for update;
  if pk.id is null then raise exception 'That code is not valid'; end if;
  if pk.created_by = me then raise exception 'That is your own code. Send it to your partner.'; end if;
  if exists (select 1 from pact_members pm join pacts p on p.id = pm.pact_id where pm.user_id = me and p.status in ('pending','active')) then
    raise exception 'You are already in a pact';
  end if;
  insert into pact_members (pact_id, user_id) values (pk.id, me);
  -- counting starts next Monday so nobody joins mid-week already behind
  update pacts set status = 'active', started_week = week_start_for(now(), tz) + 7 where id = pk.id returning * into pk;
  return pk;
end $$;

create or replace function public.end_pact(p_pact uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_pact_member(p_pact) then raise exception 'not your pact'; end if;
  update pacts set status = 'ended' where id = p_pact;
end $$;

-- "I worked out but the app didn't catch it" — the partner approves
create or replace function public.request_proof(p_pact uuid, p_day date, p_note text) returns proof_requests
language plpgsql security definer set search_path = public as $$
declare
  pk pacts;
  r proof_requests;
  today date;
begin
  select * into pk from pacts where id = p_pact and status = 'active';
  if pk.id is null or not is_pact_member(p_pact) then raise exception 'not your pact'; end if;
  today := (now() at time zone pk.tz)::date;
  if p_day > today or p_day < week_start_for(now(), pk.tz) - 7 then
    raise exception 'You can only ask about this week or last week';
  end if;
  insert into proof_requests (pact_id, user_id, day, note) values (p_pact, auth.uid(), p_day, p_note)
  on conflict (pact_id, user_id, day) do update set note = excluded.note, status = 'pending', decided_by = null, decided_at = null
  returning * into r;
  return r;
end $$;

create or replace function public.decide_proof(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r proof_requests;
begin
  select * into r from proof_requests where id = p_id;
  if r.id is null or not is_pact_member(r.pact_id) then raise exception 'not found'; end if;
  if r.user_id = auth.uid() then raise exception 'Your partner has to approve this one'; end if;
  update proof_requests set status = case when p_approve then 'approved' else 'denied' end,
    decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform resettle_if_done(r.pact_id, week_start_for(r.day::timestamp at time zone 'UTC', 'UTC'));
end $$;

-- pause: before the week starts or during its first day (pact time zone)
create or replace function public.request_pause(p_pact uuid, p_week date) returns pause_requests
language plpgsql security definer set search_path = public as $$
declare
  pk pacts;
  r pause_requests;
  today date;
begin
  select * into pk from pacts where id = p_pact and status = 'active';
  if pk.id is null or not is_pact_member(p_pact) then raise exception 'not your pact'; end if;
  if extract(isodow from p_week) <> 1 then raise exception 'week must start on Monday'; end if;
  today := (now() at time zone pk.tz)::date;
  if today > p_week then raise exception 'Pauses have to be asked for before the week starts or on its first day'; end if;
  if p_week > today + 35 then raise exception 'Too far ahead'; end if;
  insert into pause_requests (pact_id, user_id, week_start) values (p_pact, auth.uid(), p_week)
  on conflict (pact_id, user_id, week_start) do nothing
  returning * into r;
  return r;
end $$;

create or replace function public.decide_pause(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r pause_requests;
begin
  select * into r from pause_requests where id = p_id;
  if r.id is null or not is_pact_member(r.pact_id) then raise exception 'not found'; end if;
  if r.user_id = auth.uid() then raise exception 'Your partner has to approve this one'; end if;
  update pause_requests set status = case when p_approve then 'approved' else 'denied' end,
    decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform resettle_if_done(r.pact_id, r.week_start);
end $$;

create or replace function public.mark_paid(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ledger_entries set paid_at = coalesce(paid_at, now()) where id = p_id and from_user = auth.uid();
  if not found then raise exception 'not found'; end if;
end $$;

create or replace function public.mark_received(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ledger_entries set received_at = coalesce(received_at, now()), paid_at = coalesce(paid_at, now())
  where id = p_id and to_user = auth.uid();
  if not found then raise exception 'not found'; end if;
end $$;

-- App Store rule: users must be able to delete their account in the app
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update pacts set status = 'ended' where id in (select pact_id from pact_members where user_id = auth.uid());
  delete from auth.users where id = auth.uid();
end $$;

-- ============ row level security ============

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.questionnaires enable row level security;
alter table public.screenings enable row level security;
alter table public.consents enable row level security;
alter table public.gyms enable row level security;
alter table public.plans enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.pain_flags enable row level security;
alter table public.pacts enable row level security;
alter table public.pact_members enable row level security;
alter table public.pact_weeks enable row level security;
alter table public.proof_requests enable row level security;
alter table public.pause_requests enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.reactions enable row level security;

create policy "read own or partner profile" on public.profiles for select to authenticated
  using (id = auth.uid() or is_partner(id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- owner-only tables
do $$
declare t text;
begin
  foreach t in array array['questionnaires','screenings','profile_private'] loop
    execute format('create policy "owner" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
  foreach t in array array['consents','gyms','plans','pain_flags'] loop
    execute format('create policy "owner" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- workouts: owner writes, partner reads
do $$
declare t text;
begin
  foreach t in array array['workouts','workout_exercises','workout_sets'] loop
    execute format('create policy "owner writes" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "partner reads" on public.%I for select to authenticated using (is_partner(user_id))', t);
  end loop;
end $$;

create policy "see cheers on visible workouts" on public.reactions for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from workouts w where w.id = workout_id and (w.user_id = auth.uid() or is_partner(w.user_id))));
create policy "cheer partner workouts" on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from workouts w where w.id = workout_id and is_partner(w.user_id)));
create policy "remove own cheer" on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy "members read pact" on public.pacts for select to authenticated using (is_pact_member(id));
create policy "members read members" on public.pact_members for select to authenticated using (is_pact_member(pact_id));
create policy "members read weeks" on public.pact_weeks for select to authenticated using (is_pact_member(pact_id));
create policy "members read proofs" on public.proof_requests for select to authenticated using (is_pact_member(pact_id));
create policy "members read pauses" on public.pause_requests for select to authenticated using (is_pact_member(pact_id));
create policy "members read ledger" on public.ledger_entries for select to authenticated using (is_pact_member(pact_id));

-- ============ grants (no automatic API access) ============

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_private, public.questionnaires, public.screenings,
  public.gyms, public.plans, public.workouts, public.workout_exercises, public.workout_sets, public.pain_flags to authenticated;
grant select, insert on public.consents to authenticated;
grant select, insert, delete on public.reactions to authenticated;
grant select on public.pacts, public.pact_members, public.pact_weeks, public.proof_requests, public.pause_requests, public.ledger_entries to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_partner(uuid), public.is_pact_member(uuid), public.week_start_for(timestamptz, text),
  public.create_pact(int, int, text), public.join_pact(text), public.end_pact(uuid),
  public.request_proof(uuid, date, text), public.decide_proof(uuid, boolean),
  public.request_pause(uuid, date), public.decide_pause(uuid, boolean),
  public.mark_paid(uuid), public.mark_received(uuid), public.delete_my_account() to authenticated;

-- ============ weekly settle job ============
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('settle-pacts', '7 * * * *', 'select public.settle_due_pacts()');
  end if;
end $$;
