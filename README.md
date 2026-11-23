# Pact Fitness (gym app) — v1

iPhone app (Expo / React Native + Supabase):

- **Sign up** with an email code (no password).
- **Onboarding**: name, optional age/height/weight/sex, a health check (any "yes" turns on gentle mode), goals, diet plans (tracking is v2), level, days and minutes per week, home/gym and equipment, how much HIIT, and whether to build a plan.
- **Plan builder**: fixed rules turn those answers into a 4-week phase (full body / upper-lower / push-pull-legs / HIIT days), sized to your time and gear. Finish most of a phase and it offers the next level, beginner → intermediate → advanced.
- **794 exercises**: strength, bodyweight, dumbbell, barbell, kettlebell, bands, cables, machines, HIIT/plyo, cardio and stretches. Most have start/end photos.
- **Workout logger**: sets, reps, weight, rest timer, an interval timer for HIIT, warm-up and cool-down, "Machine's taken" swaps, "Something hurts".
- **Coach**: suggests small weight jumps only when earned. You must tap to accept. It never picks weights with AI.
- **Partner pact**: weekly goal + stake, invite code, partner feed with cheers, "verified at gym" badge, partner-approved make-up days, pause weeks, automatic weekly settle-up, IOU ledger with a Venmo button. The app never touches money.

## Try it on your iPhone today (Windows PC)

1. Install [Node.js LTS](https://nodejs.org) and Git.
2. In a terminal:
   ```
   git clone https://github.com/Ryan-B12/gym-app
   cd gym-app
   npm install
   npx expo start
   ```
3. Install **Expo Go** from the App Store on your iPhone and scan the QR code. Phone and PC must be on the same Wi-Fi. If it can't connect, try `npx expo start --tunnel`.

Want to look around without an account? Run `npm run demo`. It skips sign-in and fills the Pact tab with sample data.

## One-time Supabase setup (project `gym-app`)

1. **Database**: Supabase → SQL Editor → New query. Paste all of `supabase/migrations/20261123000000_init.sql` and click **Run**. Then do the same with `20261123010000_push.sql` (partner notifications).
   - Check: `select jobname, schedule from cron.job;` should list `settle-pacts`. If pg_cron didn't turn on, enable it under Integrations → Cron and run the last block of the file again.
2. **Email code**: Authentication → Emails → **Magic Link** template. Replace the body with:
   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
3. **Before real users**: Supabase's built-in email only sends a few messages an hour. Set up custom SMTP (Authentication → SMTP Settings; e.g. Resend or Postmark).
4. **App Review account**: Authentication → Users → Add user, with an email and password. Give these to Apple in App Store Connect ("Sign-in required"). In the app they tap **Sign in with a password**.

The app's Supabase URL and publishable key are in `src/config/env.ts`. They're meant to be public; row level security protects the data.

## Partner notifications

The database sends notifications through Expo's free push service when your partner trains, cheers you, joins or asks for approval, when a week settles, and on Friday at 6pm if you're short of your goal. Each type can be switched off in the Me tab. Every message is also recorded in the `notification_log` table, so you can check what went out.

To turn them on for real phones:
1. On your PC, in the project folder: `npx eas-cli@latest init`. This links the app to your Expo account and adds a `projectId` to `app.json`.
2. On your first `eas build -p ios`, answer **yes** when it offers to set up push notifications. It creates the Apple push key for you.
3. Test with two phones signed in as two accounts in one pact. Notifications don't arrive in a simulator. In Expo Go they may not arrive either, so use a TestFlight build.

## Ship to the App Store

You need the Apple Developer Program ($99/yr) and a free expo.dev account.

```
npx eas-cli@latest login
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios
```

EAS builds in the cloud, so you don't need a Mac. Before submitting:

- **Icon**: `assets/icon.png` is a first-pass design (two linked rings, orange for you and blue for your partner), drawn by `scripts/icon.py`. Swap in a designer's version any time.
- **App name**: "Pact Fitness" is a working name (`app.json`). Check it's free in App Store Connect.
- **Bundle ID**: `com.sanctuaryinc.gymapp` (`app.json`). Change it now if you want a different one. It can't change after the first upload.
- **Privacy Policy URL** and **Terms**: drafts are in `docs/legal/`. Fill in the [brackets], have a lawyer review them, then host the privacy policy at a public URL for App Store Connect. After editing, run `python3 scripts/build-legal.py` to update the in-app copy.
- **App Privacy labels**: email, fitness/health info (health check answers, body stats, workouts), coarse location (used once, not stored). None used for tracking.
- **Money stakes**: the app only keeps score between friends and never moves money. Say that plainly in the review notes; App Review can question anything that looks like betting.

## Developer commands

| | |
|---|---|
| `npm test` | 40 logic tests: plan builder, coach rules, pact math, swaps |
| `npm run test:db` | migration + security tests against a local Postgres (`PGHOST`/`PGPORT` env) |
| `npm run typecheck` | TypeScript |
| `npx eslint src tests` | lint |
| `npm run build:exercises` | rebuild `src/data/exercises.json` from a clone of free-exercise-db |

## Where things live

- `src/lib/plan.ts` plan builder · `src/lib/coach.ts` weight suggestions · `src/lib/pact.ts` week math and settle-up (mirrored in SQL) · `src/lib/swaps.ts`
- `src/app/` screens (Expo Router) · `src/state/store.ts` offline-first storage on the phone · `src/lib/sync.ts` upload to Supabase
- `supabase/migrations/` schema, row level security, pact actions, weekly settle job

## Credits

Exercise photos and most instructions: [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), released into the public domain (Unlicense). The 27 exercises with ids starting `app_` were written for this app and have no photos yet.
