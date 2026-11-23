# Decisions

- **Expo (React Native) + Supabase.** One codebase, cloud iOS builds without a Mac, same backend you use for Daisy.
- **Plans come from fixed rules, not AI.** Same answers + seed → same plan; every combination of gear × level × goal × days × minutes × HIIT preference is tested (8,100 plans).
- **Coach = double progression.** Reps first; weight goes up only after hitting the top of the rep range on every working set for 2 sessions in a row, rated Easy or Good. +5 lb upper / +10 lb lower barbell, never more than 10% of the current weight. Gentle mode: 3 sessions and half-size jumps. Warm-up sets are ignored. A pain flag blocks suggestions for that area. 2+ weeks off → 10% lighter, 4+ weeks → 20% lighter.
- **Gentle mode** turns on for any "yes" in the health check. It means level-1 moves, no jumping, max 2 sets and longer rests. Turning it off asks for a doctor's OK.
- **Exercise media**: Free Exercise DB (public domain). Start/end photos alternate on the detail screen so they read like a short animation. Swapping to a licensed GIF/video library later only changes `images` in the data file.
- **Photos load from GitHub's CDN** for now. Move them to Supabase Storage or bundle them before launch so the app doesn't depend on someone else's repo.
- **Sign-in with an email code** (not a magic link) avoids deep-link setup on iPhone. A password option exists for the App Review account.
- **Offline-first**: workouts save on the phone and sync when online, using ids made on the phone so re-syncing never duplicates.
- **Pact rules** (same in TypeScript and SQL): Monday–Sunday in the pact's time zone; 1 workout per day; at least 10 minutes; partner-approved make-up days count; an approved pause counts as a hit; both miss → even. Counting starts the Monday after the partner joins. Re-settles after a late approval until the winner marks the IOU received.
- **Gym check-in** stores only yes/no. The gym's own spot is saved on the phone only.
- **Partners see**: name, Venmo handle, workouts and sets, gym badge. **Never**: health answers, pain flags, body stats, age, pause reasons (no reason is collected).
- **18+ only** (money stakes).
- **Push notifications to your partner** are not in v1. There are local weekly reminders instead (Thursday evening, Sunday morning).
