-- Push notifications to your partner. Run after the first migration (SQL Editor → Run).
-- The database sends messages through Expo's push service (exp.host) using pg_net.
-- Every message is also written to notification_log so you can see what was sent.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create table public.push_tokens (
  token text primary key check (token like 'ExponentPushToken[%' or token like 'ExpoPushToken[%'),
  user_id uuid not null references auth.users on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

-- which kinds of messages each person wants (all on by default)
alter table public.profile_private
  add column notify jsonb not null default '{"partner_workouts": true, "cheers": true, "pact": true, "nudges": true}';

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  sent boolean not null,
  created_at timestamptz not null default now()
);
create index notification_log_user on public.notification_log (user_id, created_at desc);

-- remembers which pact members already got this week's nudge
create table public.pact_nudges (
  pact_id uuid not null references public.pacts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  primary key (pact_id, user_id, week_start)
);

alter table public.push_tokens enable row level security;
alter table public.notification_log enable row level security;
alter table public.pact_nudges enable row level security;
create policy "owner" on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own log" on public.notification_log for select to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_tokens to authenticated;
grant select on public.notification_log to authenticated;

-- ---------- sending ----------

-- category: partner_workouts | cheers | pact | nudges
create or replace function public.notify(p_user uuid, p_category text, p_title text, p_body text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  wants boolean;
  msgs jsonb;
  has_net boolean := exists (select 1 from pg_namespace where nspname = 'net');
begin
  select coalesce((notify ->> p_category)::boolean, true) into wants from profile_private where user_id = p_user;
  if wants is false then return; end if;
  select jsonb_agg(jsonb_build_object('to', token, 'title', p_title, 'body', p_body, 'sound', 'default',
                                      'data', p_data || jsonb_build_object('kind', p_category)))
    into msgs from push_tokens where user_id = p_user;
  insert into notification_log (user_id, kind, title, body, sent) values (p_user, p_category, p_title, p_body, msgs is not null and has_net);
  if msgs is null or not has_net then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', msgs, '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
end $$;

create or replace function public.display_name_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), 'Your partner') from profiles where id = p_user;
$$;

-- the other person in each of this user's active pacts
create or replace function public.partners_of(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.user_id from pact_members a
  join pact_members b on b.pact_id = a.pact_id and b.user_id <> a.user_id
  join pacts p on p.id = a.pact_id and p.status = 'active'
  where a.user_id = p_user;
$$;

-- ---------- events ----------

-- 1. partner finished a workout (skip old workouts being synced late or restored)
create or replace function public.on_workout_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  partner uuid;
  mins int := floor(extract(epoch from (new.ended_at - new.started_at)) / 60);
begin
  if mins < 10 or new.ended_at < now() - interval '12 hours' then return new; end if;
  for partner in select partners_of(new.user_id) loop
    perform notify(partner, 'partner_workouts',
      display_name_of(new.user_id) || ' just trained',
      new.title || ' · ' || mins || ' min' || case when new.verified_at_gym then ' · at the gym' else '' end,
      jsonb_build_object('workout_id', new.id));
  end loop;
  return new;
end $$;
create trigger workout_notify after insert on public.workouts for each row execute function public.on_workout_insert();

-- 2. cheers
create or replace function public.on_reaction_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; t text;
begin
  select user_id, title into owner, t from workouts where id = new.workout_id;
  if owner is not null and owner <> new.user_id then
    perform notify(owner, 'cheers', display_name_of(new.user_id) || ' cheered you on', 'For your ' || t || ' workout', '{}');
  end if;
  return new;
end $$;
create trigger reaction_notify after insert on public.reactions for each row execute function public.on_reaction_insert();

-- 3. partner joined
create or replace function public.on_member_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid; pk pacts;
begin
  select * into pk from pacts where id = new.pact_id;
  for other in select user_id from pact_members where pact_id = new.pact_id and user_id <> new.user_id loop
    perform notify(other, 'pact', display_name_of(new.user_id) || ' joined your pact',
      'Goal: ' || pk.goal || ' workouts a week. Counting starts Monday.', '{}');
  end loop;
  return new;
end $$;
create trigger member_notify after insert on public.pact_members for each row execute function public.on_member_insert();

-- 4. approval requests and decisions
create or replace function public.on_request_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid; what text;
begin
  what := case when tg_table_name = 'proof_requests' then 'a workout' else 'a pause week' end;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'pending' and old.status <> 'pending') then
    for other in select user_id from pact_members where pact_id = new.pact_id and user_id <> new.user_id loop
      perform notify(other, 'pact', display_name_of(new.user_id) || ' needs your OK',
        'They asked you to approve ' || what || '.', '{}');
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'denied') then
    perform notify(new.user_id, 'pact', display_name_of(new.decided_by) || ' ' || new.status || ' your request',
      initcap(what) || ' was ' || new.status || '.', '{}');
  end if;
  return new;
end $$;
create trigger proof_notify after insert or update on public.proof_requests for each row execute function public.on_request_change();
create trigger pause_notify after insert or update on public.pause_requests for each row execute function public.on_request_change();

-- 5. week settled (first time only; re-settles after a late approval send the decision message instead)
create or replace function public.notify_week_result(p_pact uuid, p_week date) returns void
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; m jsonb; l ledger_entries; body text;
begin
  select result into r from pact_weeks where pact_id = p_pact and week_start = p_week;
  if r is null then return; end if;
  select * into l from ledger_entries where pact_id = p_pact and week_start = p_week limit 1;
  for m in select * from jsonb_array_elements(r -> 'members') loop
    body := case r ->> 'outcome'
      when 'both_hit' then 'You both hit your goal. Nobody owes anything.'
      when 'both_missed' then 'You both missed. Call it even.'
      else case when l.from_user = (m ->> 'user_id')::uuid
        then 'You owe ' || display_name_of(l.to_user) || ' $' || trim(to_char(l.amount_cents / 100.0, 'FM999990.00'))
        else display_name_of(l.from_user) || ' owes you $' || trim(to_char(l.amount_cents / 100.0, 'FM999990.00')) end
      end;
    perform notify((m ->> 'user_id')::uuid, 'pact', 'Week settled: you did ' || (m ->> 'count') || '/' || (r ->> 'goal'), body, '{}');
  end loop;
end $$;

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
        perform notify_week_result(p.id, wk);
        n := n + 1;
      end if;
      wk := wk + 7;
    end loop;
  end loop;
  return n;
end $$;

-- 6. Friday 6pm (pact time zone) nudge for anyone still short of the goal
create or replace function public.send_nudges(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  p record; m record; local timestamp; wk date; cnt int; n int := 0;
begin
  for p in select * from pacts where status = 'active' and started_week is not null loop
    local := p_now at time zone p.tz;
    if extract(isodow from local) <> 5 or extract(hour from local) <> 18 then continue; end if;
    wk := week_start_for(p_now, p.tz);
    if wk < p.started_week then continue; end if;
    for m in select user_id from pact_members where pact_id = p.id loop
      if exists (select 1 from pact_nudges where pact_id = p.id and user_id = m.user_id and week_start = wk) then continue; end if;
      if exists (select 1 from pause_requests where pact_id = p.id and user_id = m.user_id and week_start = wk and status = 'approved') then continue; end if;
      cnt := pact_week_count(p.id, m.user_id, wk);
      if cnt < p.goal then
        perform notify(m.user_id, 'nudges', 'Weekend check-in',
          'You''re at ' || cnt || '/' || p.goal || '. ' || (p.goal - cnt) || ' more by Sunday night to stay even.', '{}');
        insert into pact_nudges values (p.id, m.user_id, wk);
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

revoke execute on function public.notify(uuid, text, text, text, jsonb), public.display_name_of(uuid), public.partners_of(uuid),
  public.notify_week_result(uuid, date), public.send_nudges(timestamptz), public.settle_due_pacts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pact-nudges', '2 * * * *', 'select public.send_nudges()');
  end if;
end $$;

-- the app calls this; a phone that changes hands moves its token to the new user
create or replace function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into push_tokens (token, user_id, platform, updated_at) values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
