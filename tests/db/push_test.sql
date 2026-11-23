\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
insert into auth.users values (:A, 'a@x.com'), (:B, 'b@x.com');
update profiles set display_name = 'Ryan' where id = :A;
update profiles set display_name = 'Alex' where id = :B;
create function pg_temp.expect_fail(stmt text, label text) returns void language plpgsql as $$
begin execute stmt; raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', label;
exception when others then if sqlerrm like 'EXPECTED FAILURE%' then raise; end if; raise notice 'ok (blocked): % -> %', label, sqlerrm; end $$;
grant execute on function pg_temp.expect_fail(text, text) to authenticated;

-- pact between A and B
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
create temp table code as select invite_code from create_pact(4, 2000, 'America/Los_Angeles');
select register_push_token('ExponentPushToken[aaa]', 'ios');
reset role;
do $$ begin assert (select count(*) from notification_log) = 0, 'nothing yet'; end $$;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select join_pact((select invite_code from code));
select register_push_token('ExponentPushToken[bbb]', 'ios');
select pg_temp.expect_fail($q$ select notify(auth.uid(), 'pact', 'x', 'y') $q$, 'call notify directly');
select pg_temp.expect_fail($q$ insert into push_tokens values ('ExponentPushToken[zzz]', 'aaaaaaaa-0000-0000-0000-000000000001', 'ios') $q$, 'add token for someone else');
reset role;
do $$ begin
  assert (select count(*) from notification_log where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and title = 'Alex joined your pact') = 1, 'joined';
end $$;

-- A trains -> B hears about it; an old workout synced late does not notify
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into workouts (id, user_id, title, started_at, ended_at, verified_at_gym) values
  ('11111111-1111-1111-1111-111111111111', auth.uid(), 'Push', now() - interval '45 min', now(), true),
  ('11111111-1111-1111-1111-111111111112', auth.uid(), 'Old', now() - interval '3 days', now() - interval '3 days' + interval '40 min', false),
  ('11111111-1111-1111-1111-111111111113', auth.uid(), 'Tiny', now() - interval '5 min', now(), false);
reset role;
do $$ begin
  assert (select count(*) from notification_log where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and kind = 'partner_workouts') = 1, 'one workout note';
  assert (select body from notification_log where kind = 'partner_workouts') = 'Push · 45 min · at the gym', (select body from notification_log where kind = 'partner_workouts');
  assert (select title from notification_log where kind = 'partner_workouts') = 'Ryan just trained', 'title';
end $$;

-- B cheers -> A hears; B turns off partner workout messages -> silence
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
insert into reactions (workout_id, user_id) values ('11111111-1111-1111-1111-111111111111', auth.uid());
update profile_private set notify = notify || '{"partner_workouts": false}' where user_id = auth.uid();
do $$ begin assert (select count(*) from notification_log) = (select count(*) from notification_log where user_id = auth.uid()), 'B only sees own log'; end $$;
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into workouts (id, user_id, title, started_at, ended_at) values ('11111111-1111-1111-1111-111111111114', auth.uid(), 'Legs', now() - interval '30 min', now());
reset role;
do $$ begin
  assert (select count(*) from notification_log where kind = 'cheers' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, 'cheer note';
  assert (select count(*) from notification_log where kind = 'partner_workouts') = 1, 'muted';
end $$;

-- approvals
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
create temp table pr as select id from request_proof((select id from pacts), (now() at time zone 'America/Los_Angeles')::date, 'run');
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select decide_proof((select id from pr), true);
reset role;
do $$ begin
  assert (select count(*) from notification_log where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and title = 'Alex needs your OK') = 1, 'ask';
  assert (select count(*) from notification_log where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and title = 'Ryan approved your request') = 1, 'decision';
end $$;

-- weekly result: A 4 days, B 1 day last week
update pacts set started_week = week_start_for(now(), tz) - 7;
delete from workouts; delete from proof_requests;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :A, 'w', ((p.started_week + d) + time '18:00') at time zone p.tz, ((p.started_week + d) + time '18:45') at time zone p.tz from pacts p, generate_series(0, 3) d;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :B, 'w', ((p.started_week) + time '07:00') at time zone p.tz, ((p.started_week) + time '07:40') at time zone p.tz from pacts p;
do $$ begin assert public.settle_due_pacts() = 1, 'settled'; end $$;
do $$ begin
  assert (select body from notification_log where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and title like 'Week settled%') = 'You owe Ryan $20.00', 'B owes';
  assert (select body from notification_log where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and title like 'Week settled%') = 'Alex owes you $20.00', 'A is owed';
  assert (select title from notification_log where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and title like 'Week settled%') = 'Week settled: you did 4/4', 'A title';
end $$;

-- Friday 6pm nudge: only for whoever is short, once per week
delete from workouts;
create temp table fri as select ((week_start_for(now(), 'America/Los_Angeles') + 4) + time '18:20') at time zone 'America/Los_Angeles' as t;
insert into workouts (id, user_id, title, started_at, ended_at)
select gen_random_uuid(), :A, 'w', ((week_start_for(now(), 'America/Los_Angeles') + d) + time '06:00') at time zone 'America/Los_Angeles',
       ((week_start_for(now(), 'America/Los_Angeles') + d) + time '06:40') at time zone 'America/Los_Angeles' from generate_series(0, 3) d;
do $$ begin
  assert public.send_nudges((select t from fri) - interval '3 hours') = 0, 'not 6pm yet';
  assert public.send_nudges((select t from fri)) = 1, 'one nudge (B)';
  assert public.send_nudges((select t from fri)) = 0, 'only once';
  assert (select body from notification_log where kind = 'nudges') = 'You''re at 0/4. 4 more by Sunday night to stay even.', (select body from notification_log where kind = 'nudges');
end $$;
select 'ALL PUSH TESTS PASSED' as result;
