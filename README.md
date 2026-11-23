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

1. **Database**: Supabase → SQL Editor → New query. Paste all of `supabase/migrations/20261123000000_init.sql` and click **Run**.
   - Check: `select jobname, schedule from cron.job;` should list `settle-pacts`. If pg_cron didn't turn on, enable it under Integrations → Cron and run the last block of the file again.
2. **Email code**: Authentication → Emails → **Magic Link** template. Replace the body with:
   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
3. **Before real users**: Supabase's built-in email only sends a few messages an hour. Set up custom SMTP (Authentication → SMTP Settings; e.g. Resend or Postmark).
4. **App Review account**: Authentication → Users → Add user, with an email and password. Give these to Apple in App Store Connect ("Sign-in required"). In the app they tap **Sign in with a password**.

The app's Supabase URL and publishable key are in `src/config/env.ts`. They're meant to be public; row level security protects the data.

## Ship to the App Store

You need the Apple Developer Program ($99/yr) and a free expo.dev account.

```
npx eas-cli@latest login
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios
```

EAS builds in the cloud, so you don't need a Mac. Before submitting:

- **Icon and splash**: `assets/icon.png` is still Expo's placeholder. Replace it with a 1024×1024 PNG.
- **App name**: "Pact Fitness" is a working name (`app.json`). Check it's free in App Store Connect.
- **Bundle ID**: `com.sanctuaryinc.gymapp` (`app.json`). Change it now if you want a different one. It can't change after the first upload.
- **Privacy Policy URL** and **Terms**: `src/app/legal.tsx` is a placeholder. Have a lawyer write real ones and host them.
- **App Privacy labels**: email, fitness/health info (health check answers, body stats, workouts), coarse location (used once, not stored). None used for tracking.
- **Money stakes**: the app only keeps score between friends and never moves money. Say that plainly in the review notes; App Review can question anything that looks like betting.

## Developer commands

| | |
|---|---|
| `npm test` | 39 logic tests: plan builder, coach rules, pact math, swaps |
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
