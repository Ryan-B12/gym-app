\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
insert into auth.users values (:A, 'a@x.com'), (:B, 'b@x.com'), (:C, 'c@x.com');

-- helper: expect a statement to fail
create function pg_temp.expect_fail(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', label;
exception when others then
  if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
  raise notice 'ok (blocked): % -> %', label, sqlerrm;
end $$;
grant execute on function pg_temp.expect_fail(text, text) to authenticated, anon;

do $$ begin assert (select count(*) from public.profiles) = 3, 'profile trigger'; end $$;

-- ===== A logs private info and a workout =====
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
insert into screenings (user_id, answers, flagged) values (auth.uid(), '{"heart":true}', true);
insert into pain_flags (user_id, area) values (auth.uid(), 'knee');
update profile_private set weight_kg = 80, birth_year = 1990 where user_id = auth.uid();
update profiles set display_name = 'Ryan', venmo_handle = '@ryan' where id = auth.uid();
insert into workouts (id, user_id, title, started_at, ended_at) values
  ('11111111-1111-1111-1111-111111111111', auth.uid(), 'Push', now() - interval '50 min', now());
insert into workout_exercises (id, workout_id, user_id, exercise_id, position) values
  ('21111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', auth.uid(), 'Pushups', 0);
insert into workout_sets (id, workout_exercise_id, workout_id, user_id, idx, reps, done) values
  ('31111111-1111-1111-1111-111111111111', '21111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', auth.uid(), 0, 12, true);
select pg_temp.expect_fail($q$ insert into workouts (id, user_id, title, started_at, ended_at) values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'x', now(), now()) $q$, 'write a workout as someone else');
select pg_temp.expect_fail($q$ insert into pacts (created_by, invite_code) values (auth.uid(), 'ZZZZZZ') $q$, 'create pact directly');
create temp table code as select invite_code from create_pact(4, 2000, 'America/Los_Angeles');
select pg_temp.expect_fail($q$ select create_pact(4, 2000, 'America/Los_Angeles') $q$, 'second pact');
select pg_temp.expect_fail($q$ select join_pact((select invite_code from code)) $q$, 'join own pact');
reset role;

-- ===== B before joining: sees nothing of A =====
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
do $$ begin
  assert (select count(*) from workouts) = 0, 'B sees A workouts before pact';
  assert (select count(*) from profiles) = 1, 'B sees other profiles before pact';
end $$;
select pg_temp.expect_fail($q$ select join_pact('NOPE12') $q$, 'bad code');
select join_pact((select invite_code from code));
do $$ begin
  assert (select count(*) from workouts) = 1, 'partner should see workout';
  assert (select count(*) from workout_sets) = 1, 'partner should see sets';
  assert (select count(*) from profiles) = 2, 'partner sees profile';
  assert (select display_name from profiles where id <> auth.uid()) = 'Ryan', 'name';
  assert (select count(*) from screenings) = 0, 'partner must NOT see screening';
  assert (select count(*) from pain_flags) = 0, 'partner must NOT see pain flags';
  assert (select count(*) from profile_private) = 1, 'only own private profile';
  assert (select user_id from profile_private) = auth.uid(), 'own private';
  assert (select status from pacts) = 'active', 'pact active';
end $$;
update workouts set title = 'hacked' where id = '11111111-1111-1111-1111-111111111111'; -- RLS: silently 0 rows
do $$ begin assert (select title from workouts where id = '11111111-1111-1111-1111-111111111111') = 'Push', 'partner edited workout'; end $$;
insert into reactions (workout_id, user_id) values ('11111111-1111-1111-1111-111111111111', auth.uid());
select pg_temp.expect_fail($q$ update ledger_entries set received_at = now() $q$, 'edit ledger directly');
reset role;

-- ===== C: outsider =====
select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
do $$ begin
  assert (select count(*) from workouts) = 0, 'C sees workouts';
  assert (select count(*) from pacts) = 0, 'C sees pact';
  assert (select count(*) from reactions) = 0, 'C sees reactions';
end $$;
select pg_temp.expect_fail($q$ select join_pact((select invite_code from code)) $q$, 'join full pact');
select pg_temp.expect_fail($q$ insert into reactions (workout_id, user_id) values ('11111111-1111-1111-1111-111111111111', auth.uid()) $q$, 'cheer stranger');
reset role;

-- ===== anon: nothing =====
set role anon;
select pg_temp.expect_fail($q$ select * from profiles $q$, 'anon read');
select pg_temp.expect_fail($q$ select create_pact(4, 100, 'UTC') $q$, 'anon rpc');
reset role;

-- ===== weekly settle =====
-- make last week the pact's first week, then log: A 4 days, B 3 days (+ one too short, + two on one day)
update pacts set started_week = week_start_for(now(), tz) - 7;
delete from workouts;
create temp table lw as select (select started_week from pacts) as wk, (select tz from pacts) as tz;
grant select on lw to authenticated;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :A, 'w', ((wk + d) + time '18:00') at time zone tz, ((wk + d) + time '18:45') at time zone tz from lw, generate_series(0, 3) d;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :B, 'w', ((wk + d) + time '07:00') at time zone tz, ((wk + d) + time '07:30') at time zone tz from lw, generate_series(0, 2) d;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :B, 'second same day', ((wk + 0) + time '19:00') at time zone tz, ((wk + 0) + time '19:30') at time zone tz from lw;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :B, 'too short', ((wk + 5) + time '19:00') at time zone tz, ((wk + 5) + time '19:05') at time zone tz from lw;
-- Sunday 11:50pm local counts for last week
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :C, 'edge', ((wk + 6) + time '23:50') at time zone tz, ((wk + 6) + time '23:59') at time zone tz from lw;

do $$ begin assert public.settle_due_pacts() = 1, 'settled one week'; end $$;
do $$ begin assert public.settle_due_pacts() = 0, 'idempotent'; end $$;
do $$ declare r jsonb; begin
  select result into r from pact_weeks;
  assert r->>'outcome' = 'one_missed', 'outcome ' || r::text;
  assert (select count(*) from ledger_entries where from_user = 'bbbbbbbb-0000-0000-0000-000000000002' and to_user = 'aaaaaaaa-0000-0000-0000-000000000001' and amount_cents = 2000) = 1, 'B owes A';
end $$;

-- B: "I worked out Friday, the app didn't catch it" -> A approves -> week re-settles -> nobody owes
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
create temp table pr as select id from request_proof((select id from pacts), (select wk + 4 from lw), 'Home workout, forgot to log');
select pg_temp.expect_fail($q$ select decide_proof((select id from pr), true) $q$, 'approve own proof');
select pg_temp.expect_fail($q$ select request_proof((select id from pacts), (select wk - 14 from lw), 'old') $q$, 'proof too old');
select pg_temp.expect_fail($q$ select request_pause((select id from pacts), (select wk from lw)) $q$, 'pause after the fact');
select request_pause((select id from pacts), (select wk + 14 from lw));
reset role;
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
select decide_proof((select id from pr), true);
do $$ begin
  assert (select result->>'outcome' from pact_weeks) = 'both_hit', 'after approval';
  assert (select count(*) from ledger_entries) = 0, 'IOU removed';
  assert (select count(*) from pause_requests) = 1, 'A sees pause request';
end $$;
-- A denies it again -> B owes again; B marks paid, A marks received -> week locked
select decide_proof((select id from pr), false);
reset role;
select set_config('request.jwt.claim.sub', :B, false);
set role authenticated;
select pg_temp.expect_fail($q$ select mark_received((select id from ledger_entries)) $q$, 'payer marks received');
select mark_paid((select id from ledger_entries));
reset role;
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
select mark_received((select id from ledger_entries));
select decide_proof((select id from pr), true);
do $$ begin assert (select count(*) from ledger_entries where received_at is not null) = 1, 'received week is locked'; end $$;
reset role;

-- both missed -> even
update pacts set goal = 7;
delete from ledger_entries; delete from pact_weeks;
do $$ begin perform public.settle_due_pacts(); assert (select result->>'outcome' from pact_weeks) = 'both_missed', 'both missed'; assert (select count(*) from ledger_entries) = 0, 'no IOU'; end $$;

-- account deletion removes everything of C
select set_config('request.jwt.claim.sub', :C, false);
set role authenticated;
select delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from auth.users where email = 'c@x.com') = 0, 'user deleted';
  assert (select count(*) from workouts where user_id = 'cccccccc-0000-0000-0000-000000000003') = 0, 'workouts deleted';
end $$;
select 'ALL DB TESTS PASSED' as result;
