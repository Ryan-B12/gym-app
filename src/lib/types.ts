export type Gear =
  | 'bodyweight' | 'dumbbell' | 'barbell' | 'rack' | 'ez_bar' | 'kettlebell' | 'bands'
  | 'cable' | 'machine' | 'bench' | 'pullup_bar' | 'medicine_ball' | 'stability_ball'
  | 'foam_roller' | 'box' | 'ab_wheel' | 'battle_ropes' | 'jump_rope';

export type Pattern =
  | 'squat' | 'lunge' | 'hinge' | 'legs_iso' | 'push_h' | 'push_v' | 'shoulder_iso'
  | 'pull_h' | 'pull_v' | 'triceps' | 'biceps' | 'forearms' | 'core' | 'plyo'
  | 'cardio' | 'calves' | 'hip_iso' | 'mobility';

export type BodyArea =
  | 'shoulder' | 'elbow' | 'wrist' | 'chest' | 'lower_back' | 'hip' | 'knee' | 'ankle';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  gear: Gear[];
  level: 1 | 2 | 3;
  category: string;
  primary: string[];
  secondary: string[];
  areas: BodyArea[];
  timed: boolean;
  compound: boolean;
  instructions: string[];
  images: string[];
  source: 'fedb' | 'app';
}

export type Goal =
  | 'build_muscle' | 'lose_fat' | 'get_stronger' | 'endurance' | 'general_health' | 'mobility';

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type HiitPref = 'none' | 'some' | 'lots';
export type Unit = 'lb' | 'kg';
export type Effort = 'easy' | 'good' | 'hard' | 'max';

export interface PlanInput {
  goals: Goal[];
  level: Level;
  daysPerWeek: number; // 2..6
  minutesPerSession: number; // 15..90
  gear: Gear[];
  hiit: HiitPref;
  conservative: boolean;
  painAreas: BodyArea[];
  seed?: number;
}

export interface BlockItem {
  exerciseId: string;
  sets: number;
  /** rep range for rep-based moves */
  reps?: [number, number];
  /** seconds for timed moves */
  seconds?: number;
  restSec: number;
}

export type BlockType = 'warmup' | 'strength' | 'circuit' | 'interval' | 'cooldown';

export interface Block {
  type: BlockType;
  title: string;
  /** circuit / interval rounds */
  rounds?: number;
  workSec?: number;
  restSec?: number;
  items: BlockItem[];
}

export interface PlanDay {
  key: string;
  title: string;
  kind: 'strength' | 'hiit' | 'mixed';
  estMinutes: number;
  blocks: Block[];
}

export interface Plan {
  version: 1;
  level: Level;
  phase: number; // 1, 2, 3 ... each phase lasts `weeks`
  weeks: number;
  createdAt: string;
  input: PlanInput;
  days: PlanDay[];
  notes: string[];
}

/** One logged working or warm-up set */
export interface LoggedSet {
  kind: 'warmup' | 'work';
  weight: number | null; // null = bodyweight
  reps: number | null;
  seconds: number | null;
  done: boolean;
}

/** One exercise as it was done in one past session (newest first in history arrays) */
export interface ExerciseSession {
  date: string; // ISO
  unit: Unit;
  repRange: [number, number] | null;
  targetSeconds: number | null;
  sets: LoggedSet[];
  effort: Effort | null;
}
