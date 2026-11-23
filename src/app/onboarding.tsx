import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import {
  Button, C, Card, Chip, Choice, F, Field, Icon, Progress, Row, Screen, Stepper, T,
} from '../components/ui';
import { FULL_GYM, GEAR_LABELS, getExercise } from '../lib/exercises';
import { generatePlan } from '../lib/plan';
import { SCREENING_QUESTIONS, oldEnough, screeningFlagged } from '../lib/screening';
import { errorText } from '../lib/supabase';
import { pushConsents, pushOnboarding } from '../lib/sync';
import type { Gear, Goal, Level } from '../lib/types';
import { useStore } from '../state/store';

const GOALS: { id: Goal; title: string; detail: string; icon: any }[] = [
  { id: 'build_muscle', title: 'Build muscle', detail: 'Look and feel stronger', icon: 'body' },
  { id: 'lose_fat', title: 'Lose fat', detail: 'Burn more, get leaner', icon: 'flame' },
  { id: 'get_stronger', title: 'Get stronger', detail: 'Lift heavier over time', icon: 'barbell' },
  { id: 'endurance', title: 'Better endurance', detail: 'More gas in the tank', icon: 'pulse' },
  { id: 'general_health', title: 'Feel healthier', detail: 'Energy, sleep, mood', icon: 'heart' },
  { id: 'mobility', title: 'Move better', detail: 'Flexibility, fewer aches', icon: 'accessibility' },
];

const LEVELS: { id: Level; title: string; detail: string }[] = [
  { id: 'beginner', title: 'Beginner', detail: 'New to training, or back after a long break' },
  { id: 'intermediate', title: 'Intermediate', detail: 'Training regularly for 6+ months, know the main lifts' },
  { id: 'advanced', title: 'Advanced', detail: 'Years of consistent training, comfortable with heavy compound lifts' },
];

const GEAR_ORDER: Gear[] = ['dumbbell', 'bench', 'barbell', 'rack', 'kettlebell', 'bands', 'pullup_bar', 'cable', 'machine', 'ez_bar', 'medicine_ball', 'stability_ball', 'foam_roller', 'box', 'jump_rope', 'ab_wheel', 'battle_ropes'];

const STEPS = ['name', 'about', 'health', 'goals', 'diet', 'level', 'schedule', 'gear', 'hiit', 'wantsPlan', 'terms', 'preview'] as const;
type Step = typeof STEPS[number];

export default function Onboarding() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editing = params.edit === '1';
  const st = useStore();
  const { profile, answers, setProfile, setAnswers } = st;
  const steps = useMemo(() => STEPS.filter((x) => !(editing && (x === 'terms' || x === 'name'))), [editing]);
  const [i, setI] = useState(editing ? steps.indexOf('goals') : 0);
  const step: Step = steps[i];
  const [busy, setBusy] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [agree, setAgree] = useState({ age: false, advice: false, terms: false });

  // imperial helpers for the optional body stats
  const imperial = profile.unit === 'lb';
  const [ft, setFt] = useState(profile.heightCm ? String(Math.floor(profile.heightCm / 2.54 / 12)) : '');
  const [inch, setInch] = useState(profile.heightCm ? String(Math.round((profile.heightCm / 2.54) % 12)) : '');
  const [cm, setCm] = useState(profile.heightCm ? String(profile.heightCm) : '');
  const [wt, setWt] = useState(profile.weightKg ? String(Math.round(imperial ? profile.weightKg * 2.20462 : profile.weightKg)) : '');
  const [by, setBy] = useState(profile.birthYear ? String(profile.birthYear) : '');

  const flagged = screeningFlagged(answers.screening);
  const plan = useMemo(() => (step === 'preview' && answers.wantsPlan ? generatePlan({
    goals: answers.goals.length ? answers.goals : ['general_health'], level: profile.level, daysPerWeek: answers.daysPerWeek,
    minutesPerSession: answers.minutes, gear: answers.gear, hiit: answers.hiit, conservative: flagged || profile.conservative,
    painAreas: st.painAreas, seed,
  }) : null), [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAbout = () => {
    const h = imperial ? (Number(ft) * 12 + Number(inch || 0)) * 2.54 : Number(cm);
    const w = Number(wt);
    const y = Number(by);
    setProfile({
      heightCm: h > 50 && h < 260 ? Math.round(h * 10) / 10 : null,
      weightKg: w > 0 ? Math.round((imperial ? w / 2.20462 : w) * 10) / 10 : null,
      birthYear: y > 1900 && y <= new Date().getFullYear() ? y : null,
    });
  };

  const canNext = (): boolean => {
    switch (step) {
      case 'name': return profile.displayName.trim().length > 0;
      case 'about': return oldEnough(by ? Number(by) : null) !== false;
      case 'health': return SCREENING_QUESTIONS.every((q) => typeof answers.screening[q.id] === 'boolean');
      case 'goals': return answers.goals.length > 0;
      case 'diet': return !!answers.dietChange;
      case 'terms': return agree.age && agree.advice && agree.terms;
      default: return true;
    }
  };

  const next = async () => {
    if (step === 'about') saveAbout();
    if (step === 'health' && flagged) setProfile({ conservative: true });
    if (step === 'wantsPlan' && !answers.wantsPlan) {
      if (editing) { await finish(); return; }
      setI(steps.indexOf('terms')); return;
    }
    if (step === 'terms' && !answers.wantsPlan) { await finish(); return; }
    if (step === 'preview') { await finish(); return; }
    setI((n) => Math.min(steps.length - 1, n + 1));
  };

  const finish = async () => {
    setBusy(true);
    useStore.setState({
      onboarded: true,
      plan: answers.wantsPlan ? plan : null,
      planStartedAt: answers.wantsPlan ? new Date().toISOString() : null,
      nextDay: 0,
    });
    try {
      if (!editing) await pushConsents();
      await pushOnboarding();
    } catch (e) {
      // saved on the phone; it will sync later
      console.warn('sync later', errorText(e));
    }
    setBusy(false);
    router.replace('/(tabs)');
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          <Row>
            {i > 0 ? <Button title="Back" kind="secondary" onPress={() => setI((n) => n - 1)} style={{ flex: 1 }} /> : null}
            <Button
              title={step === 'preview' ? 'Start my plan' : step === 'terms' && !answers.wantsPlan ? 'Finish' : 'Next'}
              onPress={next} disabled={!canNext()} busy={busy} style={{ flex: 2 }}
            />
          </Row>
        }
      >
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T style={F.small}>Step {i + 1} of {steps.length}</T>
            {editing ? <Button title="Cancel" kind="ghost" small onPress={() => router.back()} /> : null}
          </Row>
          <Progress value={(i + 1) / steps.length} height={4} />
        </View>

        {step === 'name' && (
          <>
            <T style={F.h1}>What should we call you?</T>
            <T style={F.sub}>Your partner sees this name.</T>
            <Field label="First name" value={profile.displayName} onChangeText={(t) => setProfile({ displayName: t.slice(0, 40) })} autoCapitalize="words" placeholder="Ryan" />
          </>
        )}

        {step === 'about' && (
          <>
            <T style={F.h1}>About you</T>
            <T style={F.sub}>All optional. Only you can see this. It helps us give better suggestions.</T>
            <Row>
              <Chip label="Pounds / feet" on={imperial} onPress={() => setProfile({ unit: 'lb' })} />
              <Chip label="Kilograms / cm" on={!imperial} onPress={() => setProfile({ unit: 'kg' })} />
            </Row>
            <Field label="Birth year" value={by} onChangeText={(t) => setBy(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="1990" />
            {oldEnough(by.length === 4 ? Number(by) : null) === false ? <T style={{ color: C.warn }}>You need to be 18 or older to use this app.</T> : null}
            {imperial ? (
              <Row>
                <View style={{ flex: 1 }}><Field label="Height (ft)" value={ft} onChangeText={(t) => setFt(t.replace(/\D/g, '').slice(0, 1))} keyboardType="number-pad" placeholder="5" /></View>
                <View style={{ flex: 1 }}><Field label="(in)" value={inch} onChangeText={(t) => setInch(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="10" /></View>
              </Row>
            ) : (
              <Field label="Height (cm)" value={cm} onChangeText={(t) => setCm(t.replace(/[^\d.]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder="178" />
            )}
            <Field label={`Weight (${profile.unit})`} value={wt} onChangeText={(t) => setWt(t.replace(/[^\d.]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder={imperial ? '180' : '82'} />
            <T style={F.label}>Sex</T>
            <Row style={{ flexWrap: 'wrap' }}>
              {(['female', 'male', 'other'] as const).map((x) => (
                <Chip key={x} label={x === 'other' ? 'Prefer to describe' : x[0].toUpperCase() + x.slice(1)} on={profile.sex === x} onPress={() => setProfile({ sex: profile.sex === x ? null : x })} />
              ))}
            </Row>
          </>
        )}

        {step === 'health' && (
          <>
            <T style={F.h1}>Quick health check</T>
            <T style={F.sub}>Private to you. A "yes" doesn't stop you. It turns on gentle mode: lighter moves, no jumping, smaller weight jumps.</T>
            {SCREENING_QUESTIONS.map((q) => (
              <Card key={q.id}>
                <T>{q.text}</T>
                <Row>
                  <Chip label="No" on={answers.screening[q.id] === false} onPress={() => setAnswers({ screening: { ...answers.screening, [q.id]: false } })} />
                  <Chip label="Yes" on={answers.screening[q.id] === true} onPress={() => setAnswers({ screening: { ...answers.screening, [q.id]: true } })} />
                </Row>
              </Card>
            ))}
            {flagged ? (
              <Card tone="warn">
                <Row><Icon name="medkit" color={C.warn} /><T style={F.h3}>Talk to your doctor first</T></Row>
                <T style={F.sub}>Please get a doctor's OK before starting a new program. We'll keep things gentle until you change it in your profile.</T>
              </Card>
            ) : null}
          </>
        )}

        {step === 'goals' && (
          <>
            <T style={F.h1}>What are your goals?</T>
            <T style={F.sub}>Pick all that apply.</T>
            {GOALS.map((g) => (
              <Choice key={g.id} title={g.title} detail={g.detail} icon={g.icon} on={answers.goals.includes(g.id)} onPress={() => setAnswers({ goals: toggle(answers.goals, g.id) })} />
            ))}
          </>
        )}

        {step === 'diet' && (
          <>
            <T style={F.h1}>Planning any diet changes?</T>
            <T style={F.sub}>Food tracking is coming in a later version. This helps us know what you'll want.</T>
            <Choice title="No, just training for now" on={answers.dietChange === 'no'} onPress={() => setAnswers({ dietChange: 'no' })} />
            <Choice title="Maybe, still thinking" on={answers.dietChange === 'maybe'} onPress={() => setAnswers({ dietChange: 'maybe' })} />
            <Choice title="Yes, I'm changing how I eat" on={answers.dietChange === 'yes'} onPress={() => setAnswers({ dietChange: 'yes' })} />
            {answers.dietChange === 'yes' || answers.dietChange === 'maybe' ? (
              <Field label="What are you thinking? (optional)" value={answers.dietNotes} onChangeText={(t) => setAnswers({ dietNotes: t.slice(0, 500) })} placeholder="More protein, cutting sugar..." multiline style={{ height: 90, paddingTop: 12 }} />
            ) : null}
          </>
        )}

        {step === 'level' && (
          <>
            <T style={F.h1}>Where are you starting?</T>
            <T style={F.sub}>Be honest. Plans move you up a level as you finish them.</T>
            {LEVELS.map((l) => <Choice key={l.id} title={l.title} detail={l.detail} on={profile.level === l.id} onPress={() => setProfile({ level: l.id })} />)}
            {flagged || profile.conservative ? <T style={{ color: C.warn }}>Gentle mode is on, so your plan starts with beginner moves either way.</T> : null}
          </>
        )}

        {step === 'schedule' && (
          <>
            <T style={F.h1}>How much time do you have?</T>
            <Card>
              <T style={F.label}>Workouts per week</T>
              <Stepper value={answers.daysPerWeek} onChange={(n) => setAnswers({ daysPerWeek: n })} min={2} max={6} suffix="days" />
            </Card>
            <Card>
              <T style={F.label}>Minutes per workout</T>
              <Row style={{ flexWrap: 'wrap' }}>
                {[15, 20, 30, 45, 60, 75, 90].map((m) => <Chip key={m} label={`${m} min`} on={answers.minutes === m} onPress={() => setAnswers({ minutes: m })} />)}
              </Row>
            </Card>
            <T style={F.sub}>That's about {Math.round((answers.daysPerWeek * answers.minutes) / 60 * 10) / 10} hours a week.</T>
          </>
        )}

        {step === 'gear' && (
          <>
            <T style={F.h1}>Where do you train?</T>
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip label="At home" icon="home" on={answers.location === 'home'} onPress={() => setAnswers({ location: 'home', gear: answers.location === 'home' ? answers.gear : [] })} />
              <Chip label="At a gym" icon="business" on={answers.location === 'gym'} onPress={() => setAnswers({ location: 'gym', gear: FULL_GYM })} />
              <Chip label="Both" icon="swap-horizontal" on={answers.location === 'both'} onPress={() => setAnswers({ location: 'both', gear: FULL_GYM })} />
            </Row>
            <T style={F.sub}>
              {answers.location === 'home' ? 'Tap everything you have. Bodyweight moves are always included.' : 'We picked a typical gym. Untick anything yours doesn\'t have.'}
            </T>
            <Row style={{ flexWrap: 'wrap' }}>
              {GEAR_ORDER.map((g) => <Chip key={g} label={GEAR_LABELS[g]} on={answers.gear.includes(g)} onPress={() => setAnswers({ gear: toggle(answers.gear, g) })} />)}
            </Row>
            {answers.location === 'both' ? <T style={F.small}>Tip: when you train at home, use "Machine's taken" in a workout to swap any move for one you can do there.</T> : null}
          </>
        )}

        {step === 'hiit' && (
          <>
            <T style={F.h1}>How do you feel about HIIT?</T>
            <T style={F.sub}>Short bursts of hard work with rest in between. Great for fat loss and fitness.</T>
            <Choice title="Not for me" detail="Strength and stretching only" on={answers.hiit === 'none'} onPress={() => setAnswers({ hiit: 'none' })} />
            <Choice title="Some is fine" detail="Added when it fits your goals" on={answers.hiit === 'some'} onPress={() => setAnswers({ hiit: 'some' })} />
            <Choice title="Love it" detail="Give me dedicated HIIT days" on={answers.hiit === 'lots'} onPress={() => setAnswers({ hiit: 'lots' })} />
          </>
        )}

        {step === 'wantsPlan' && (
          <>
            <T style={F.h1}>Want us to build your plan?</T>
            <T style={F.sub}>We'll lay out every workout for the next 4 weeks, then move you from beginner toward advanced as you finish each phase.</T>
            <Choice title="Yes, build my plan" detail="Recommended" icon="sparkles" on={answers.wantsPlan} onPress={() => setAnswers({ wantsPlan: true })} />
            <Choice title="No, I'll log my own workouts" detail="You can build a plan later" icon="create" on={!answers.wantsPlan} onPress={() => setAnswers({ wantsPlan: false })} />
          </>
        )}

        {step === 'terms' && (
          <>
            <T style={F.h1}>Before you start</T>
            <Choice title="I'm 18 or older" on={agree.age} onPress={() => setAgree((a) => ({ ...a, age: !a.age }))} />
            <Choice title="I understand this is not medical advice" detail="Suggestions are general guidance. I decide what I lift and I train at my own risk." on={agree.advice} onPress={() => setAgree((a) => ({ ...a, advice: !a.advice }))} />
            <Choice title="I agree to the Terms and Privacy Policy" on={agree.terms} onPress={() => setAgree((a) => ({ ...a, terms: !a.terms }))} />
            <Button title="Read the Terms and Privacy Policy" kind="ghost" small onPress={() => router.push('/legal')} />
          </>
        )}

        {step === 'preview' && plan && (
          <>
            <T style={F.h1}>Your plan</T>
            <T style={F.sub}>Phase 1 · {plan.level[0].toUpperCase() + plan.level.slice(1)} · {plan.days.length} workouts a week for {plan.weeks} weeks</T>
            {plan.days.map((d) => (
              <Card key={d.key}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T style={F.h3}>{d.title}</T>
                  <T style={F.small}>~{d.estMinutes} min</T>
                </Row>
                {d.blocks.filter((b) => b.type === 'strength' || b.type === 'interval').map((b, bi) => (
                  <View key={bi} style={{ gap: 4 }}>
                    {b.type === 'interval' ? <T style={F.small}>{b.title}: {b.rounds} rounds · {b.workSec}s on / {b.restSec}s off</T> : null}
                    {b.items.map((it) => (
                      <Row key={it.exerciseId} style={{ justifyContent: 'space-between' }}>
                        <T style={{ flex: 1, color: C.text }} numberOfLines={1}>{getExercise(it.exerciseId)?.name}</T>
                        {b.type === 'strength' ? <T style={F.small}>{it.sets} × {it.reps ? `${it.reps[0]}–${it.reps[1]}` : `${it.seconds}s`}</T> : null}
                      </Row>
                    ))}
                  </View>
                ))}
              </Card>
            ))}
            {plan.notes.map((n) => <T key={n} style={F.small}>• {n}</T>)}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
