import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  BlockItem, BodyArea, Effort, Gear, Goal, HiitPref, Level, LoggedSet, Plan, Unit,
} from '../lib/types';

export interface Profile {
  displayName: string;
  unit: Unit;
  level: Level;
  conservative: boolean;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  sex: 'female' | 'male' | 'other' | null;
  timezone: string;
  venmo: string;
}

export interface Questionnaire {
  goals: Goal[];
  dietChange: 'no' | 'maybe' | 'yes' | null;
  dietNotes: string;
  daysPerWeek: number;
  minutes: number;
  location: 'home' | 'gym' | 'both';
  gear: Gear[];
  hiit: HiitPref;
  screening: Record<string, boolean>;
  wantsPlan: boolean;
}

export interface WorkoutExerciseRecord {
  id: string;
  exerciseId: string;
  repRange: [number, number] | null;
  targetSeconds: number | null;
  restSec: number;
  effort: Effort | null;
  swappedFrom: string | null;
  sets: LoggedSet[];
}

export interface IntervalBlockRecord {
  title: string;
  rounds: number;
  workSec: number;
  restSec: number;
  exerciseIds: string[];
  roundsDone: number;
}

export interface WorkoutRecord {
  id: string;
  title: string;
  planDayKey: string | null;
  startedAt: string;
  endedAt: string;
  verifiedAtGym: boolean;
  effort: Effort | null;
  unit: Unit;
  exercises: WorkoutExerciseRecord[];
  intervals: IntervalBlockRecord[];
  warmupIds: string[];
  cooldownIds: string[];
  synced: boolean;
}

export type ActiveWorkout = Omit<WorkoutRecord, 'endedAt' | 'effort' | 'synced'>;

export interface GymSpot { name: string; lat: number; lng: number }

interface State {
  hydrated: boolean;
  onboarded: boolean;
  profile: Profile;
  answers: Questionnaire;
  plan: Plan | null;
  planStartedAt: string | null;
  nextDay: number;
  workouts: WorkoutRecord[];
  active: ActiveWorkout | null;
  painAreas: BodyArea[];
  gym: GymSpot | null;
  remindersOn: boolean;
  set: (p: Partial<State>) => void;
  setProfile: (p: Partial<Profile>) => void;
  setAnswers: (p: Partial<Questionnaire>) => void;
  setActive: (fn: (a: ActiveWorkout) => ActiveWorkout) => void;
  reset: () => void;
}

const tz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'; } catch { return 'America/Los_Angeles'; }
})();

export const defaultProfile: Profile = {
  displayName: '', unit: 'lb', level: 'beginner', conservative: false, birthYear: null,
  heightCm: null, weightKg: null, sex: null, timezone: tz, venmo: '',
};

export const defaultAnswers: Questionnaire = {
  goals: [], dietChange: null, dietNotes: '', daysPerWeek: 3, minutes: 45, location: 'gym',
  gear: [], hiit: 'some', screening: {}, wantsPlan: true,
};

const initial = {
  onboarded: false, profile: defaultProfile, answers: defaultAnswers, plan: null, planStartedAt: null,
  nextDay: 0, workouts: [], active: null, painAreas: [], gym: null, remindersOn: false,
};

export const useStore = create<State>()(
  persist(
    (set) => ({
      hydrated: false,
      ...initial,
      set: (p) => set(p),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setAnswers: (p) => set((s) => ({ answers: { ...s.answers, ...p } })),
      setActive: (fn) => set((s) => (s.active ? { active: fn(s.active) } : {})),
      reset: () => set({ ...initial }),
    }),
    {
      name: 'gym-app-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated, set, setProfile, setAnswers, setActive, reset, ...rest }) => rest,
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);

export function itemTarget(it: BlockItem): { repRange: [number, number] | null; targetSeconds: number | null } {
  return { repRange: it.reps ?? null, targetSeconds: it.seconds ?? null };
}
