import data from '../data/exercises.json';
import type { BodyArea, Exercise, Gear, Pattern } from './types';

/** Demo builds hosted where outside images can't load ship their own copies of the photos. */
const LOCAL_IMG = process.env.EXPO_PUBLIC_LOCAL_IMAGES === '1';
/** In those builds every photo, in exercises.json order, is one cell of a photo sheet (see ExerciseImage). */
let cell = 0;
function localize(e: Exercise): Exercise {
  if (!LOCAL_IMG || !e.images.length) return e;
  return { ...e, images: e.images.map(() => `sprite:${cell++}`) };
}
export const EXERCISES = (data as Exercise[]).map(localize);
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/** Bodyweight is always available. */
export function hasGear(ex: Exercise, gear: Gear[]): boolean {
  const have = new Set<Gear>(['bodyweight', ...gear]);
  return ex.gear.every((g) => have.has(g));
}

export function loadsArea(ex: Exercise, areas: BodyArea[]): boolean {
  return ex.areas.some((a) => areas.includes(a));
}

/** Never put these in a generated plan (still browsable in the library). */
export const PLAN_BLOCKLIST = new Set([
  'Kipping_Muscle_Up', 'Muscle_Up', 'Wide-Grip_Pulldown_Behind_The_Neck', 'Rocky_Pull-Ups_Pulldowns',
  'Hanging_Leg_Raise',
]);

/** Exercises that are harder than the dataset's label says. */
export const LEVEL_OVERRIDE: Record<string, 1 | 2 | 3> = {
  Pullups: 2, 'Chin-Up': 2, Knee_Tuck_Jump: 2, 'V-Bar_Pullup': 2, 'Dips_-_Triceps_Version': 2, Barbell_Deadlift: 2,
};

export function effectiveLevel(ex: Exercise): number {
  return LEVEL_OVERRIDE[ex.id] ?? ex.level;
}

/** Well-known staples get picked first so plans look like what a coach would write. */
export const STAPLES: Partial<Record<Pattern, string[]>> = {
  squat: ['Barbell_Full_Squat', 'Goblet_Squat', 'Dumbbell_Squat', 'Leg_Press', 'Squats_-_With_Bands', 'app_band_squat', 'app_bw_squat', 'app_db_thruster', 'app_wall_sit'],
  lunge: ['Dumbbell_Lunges', 'Split_Squat_with_Dumbbells', 'app_reverse_lunge', 'Bodyweight_Walking_Lunge', 'Dumbbell_Step_Ups', 'app_bw_stepup'],
  hinge: ['Romanian_Deadlift', 'Barbell_Hip_Thrust', 'Stiff-Legged_Dumbbell_Deadlift', 'app_kb_swing', 'app_band_deadlift', 'app_glute_bridge', 'Single_Leg_Glute_Bridge', 'Hyperextensions_Back_Extensions', 'Barbell_Deadlift', 'app_superman'],
  push_h: ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press', 'Incline_Dumbbell_Press', 'Pushups', 'app_band_chest_press', 'Incline_Push-Up'],
  push_v: ['Dumbbell_Shoulder_Press', 'Seated_Dumbbell_Press', 'Machine_Shoulder_Military_Press', 'Barbell_Shoulder_Press', 'Shoulder_Press_-_With_Bands', 'Arnold_Dumbbell_Press'],
  pull_h: ['Bent_Over_Barbell_Row', 'Seated_Cable_Rows', 'app_db_row', 'app_band_row', 'Inverted_Row'],
  pull_v: ['Pullups', 'Wide-Grip_Lat_Pulldown', 'Chin-Up', 'app_band_pulldown', 'Band_Assisted_Pull-Up'],
  core: ['Plank', 'Dead_Bug', 'app_side_plank', 'app_bird_dog', 'app_bicycle_crunch', 'Cable_Crunch', 'app_plank_tap', 'Crunches', 'Russian_Twist'],
  biceps: ['Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Cable_Hammer_Curls_-_Rope_Attachment', 'app_band_curl'],
  triceps: ['Triceps_Pushdown', 'Bench_Dips', 'Tricep_Dumbbell_Kickback', 'app_band_pushdown', 'Dips_-_Triceps_Version'],
  shoulder_iso: ['Side_Lateral_Raise', 'Face_Pull', 'Band_Pull_Apart', 'Lateral_Raise_-_With_Bands', 'Reverse_Flyes'],
  legs_iso: ['Leg_Extensions', 'Lying_Leg_Curls'],
  calves: ['Standing_Calf_Raises', 'Seated_Calf_Raise'],
  plyo: ['app_jumping_jack', 'app_high_knees', 'Mountain_Climbers', 'app_squat_jump', 'app_burpee', 'app_skater', 'Knee_Tuck_Jump', 'app_bear_crawl'],
};

/** Low-impact moves for HIIT when jumping is off the table. */
export const LOW_IMPACT_CONDITIONING = [
  'app_bw_squat', 'app_reverse_lunge', 'app_glute_bridge', 'Dead_Bug', 'app_bird_dog', 'Plank',
  'app_bicycle_crunch', 'Incline_Push-Up', 'app_wall_sit', 'app_band_row', 'app_kb_swing', 'app_db_thruster',
  'Air_Bike', 'app_bw_stepup',
];

export const WARMUP_MOVES = [
  'Arm_Circles', 'Shoulder_Circles', 'Standing_Hip_Circles', 'Knee_Circles', 'Cat_Stretch', 'Inchworm',
  'Front_Leg_Raises', 'Dynamic_Chest_Stretch', 'Dynamic_Back_Stretch', 'Worlds_Greatest_Stretch',
];

export const COOLDOWN_MOVES = [
  'Childs_Pose', 'Hamstring_Stretch', 'Standing_Hip_Flexors', 'Runners_Stretch', 'Shoulder_Stretch',
  'Triceps_Stretch', 'Upper_Back_Stretch', 'Spinal_Stretch', 'Kneeling_Hip_Flexor',
  'Standing_Gastrocnemius_Calf_Stretch', 'On_Your_Side_Quad_Stretch',
];

export const GEAR_LABELS: Record<Gear, string> = {
  bodyweight: 'Just my body',
  dumbbell: 'Dumbbells',
  barbell: 'Barbell + plates',
  rack: 'Squat rack',
  ez_bar: 'EZ curl bar',
  kettlebell: 'Kettlebells',
  bands: 'Resistance bands',
  cable: 'Cable machine',
  machine: 'Weight machines / cardio machines',
  bench: 'Bench',
  pullup_bar: 'Pull-up / dip bar',
  medicine_ball: 'Medicine ball',
  stability_ball: 'Stability ball',
  foam_roller: 'Foam roller',
  box: 'Plyo box',
  ab_wheel: 'Ab wheel',
  battle_ropes: 'Battle ropes',
  jump_rope: 'Jump rope',
};

export const FULL_GYM: Gear[] = [
  'dumbbell', 'barbell', 'rack', 'ez_bar', 'kettlebell', 'bands', 'cable', 'machine', 'bench',
  'pullup_bar', 'medicine_ball', 'stability_ball', 'foam_roller', 'box', 'ab_wheel', 'battle_ropes', 'jump_rope',
];

export const PATTERN_LABELS: Record<Pattern, string> = {
  squat: 'Squat', lunge: 'Lunge', hinge: 'Hinge / glutes', legs_iso: 'Leg isolation', push_h: 'Chest press',
  push_v: 'Overhead press', shoulder_iso: 'Shoulders', pull_h: 'Row', pull_v: 'Pull-down / pull-up',
  triceps: 'Triceps', biceps: 'Biceps', forearms: 'Forearms', core: 'Core', plyo: 'Cardio / jumps',
  cardio: 'Cardio machine', calves: 'Calves', hip_iso: 'Hips', mobility: 'Stretch / mobility',
};

export const AREA_LABELS: Record<BodyArea, string> = {
  shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist', chest: 'Chest', lower_back: 'Lower back',
  hip: 'Hip', knee: 'Knee', ankle: 'Ankle',
};
