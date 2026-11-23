import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, C, Card, F, Icon, Progress, Row, Screen, T } from '../../components/ui';
import { getExercise } from '../../lib/exercises';
import { sessionsSince } from '../../lib/history';
import { generatePlan, phaseReview, primaryGoal } from '../../lib/plan';
import { pushOnboarding, pushPlan } from '../../lib/sync';
import type { Level } from '../../lib/types';
import { useStore } from '../../state/store';

const GOAL_LABEL: Record<string, string> = {
  build_muscle: 'Build muscle', lose_fat: 'Lose fat', get_stronger: 'Get stronger', endurance: 'Endurance', general_health: 'Feel healthier', mobility: 'Move better',
};

export default function PlanTab() {
  const { plan, workouts, planStartedAt, painAreas, profile, answers } = useStore();
  const [open, setOpen] = useState<string | null>(plan?.days[0]?.key ?? null);
  const [now] = useState(() => Date.now());

  if (!plan) {
    return (
      <Screen>
        <T style={F.h1}>Plan</T>
        <Card>
          <T style={F.h3}>No plan yet</T>
          <T style={F.sub}>Tell us your goals, time and equipment and we'll lay out every workout.</T>
          <Button title="Build my plan" onPress={() => { useStore.getState().setAnswers({ wantsPlan: true }); router.push({ pathname: '/onboarding', params: { edit: '1' } }); }} />
        </Card>
      </Screen>
    );
  }

  const done = sessionsSince(workouts, planStartedAt);
  const planned = plan.days.length * plan.weeks;
  const review = phaseReview({ plan, sessionsDone: done, painActive: painAreas.length > 0 });
  const week = planStartedAt ? Math.min(plan.weeks, Math.floor((now - new Date(planStartedAt).getTime()) / (7 * 86_400_000)) + 1) : 1;

  const nextPhase = async (level: Level) => {
    useStore.getState().setProfile({ level });
    const p = generatePlan({ ...plan.input, level, painAreas, conservative: profile.conservative, seed: Math.floor(Math.random() * 1e9) }, plan.phase + 1);
    useStore.setState({ plan: p, planStartedAt: new Date().toISOString(), nextDay: 0 });
    try { await pushOnboarding(); await pushPlan(); } catch { /* syncs later */ }
  };

  return (
    <Screen>
      <T style={F.h1}>Your plan</T>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T style={F.h3}>Phase {plan.phase} · {plan.level[0].toUpperCase() + plan.level.slice(1)}</T>
          <T style={F.small}>Week {week} of {plan.weeks}</T>
        </Row>
        <T style={F.sub}>{primaryGoal(plan.input.goals) ? plan.input.goals.map((g) => GOAL_LABEL[g]).join(' · ') : ''}</T>
        <T style={F.small}>{plan.days.length} days a week · ~{plan.input.minutesPerSession} min · {answers.location === 'home' ? 'Home' : answers.location === 'gym' ? 'Gym' : 'Home + gym'}</T>
        <Progress value={done / planned} />
        <T style={F.small}>{done} of {planned} sessions done this phase</T>
      </Card>

      {review.complete ? (
        <Card tone="good">
          <T style={F.h3}>{review.message}</T>
          {review.offerLevelUp && review.nextLevel ? (
            <Row>
              <Button title={`Move to ${review.nextLevel}`} onPress={() => nextPhase(review.nextLevel!)} style={{ flex: 1 }} />
              <Button title="Repeat level" kind="secondary" onPress={() => nextPhase(plan.level)} style={{ flex: 1 }} />
            </Row>
          ) : <Button title="Start next phase" onPress={() => nextPhase(plan.level)} />}
        </Card>
      ) : null}

      {plan.days.map((d) => {
        const isOpen = open === d.key;
        return (
          <Card key={d.key}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : d.key)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T style={F.h3}>{d.title}</T>
                  <T style={F.small}>~{d.estMinutes} min · {d.kind === 'hiit' ? 'Intervals' : d.kind === 'mixed' ? 'Strength + finisher' : 'Strength'}</T>
                </View>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} color={C.sub} />
              </Row>
            </Pressable>
            {isOpen ? d.blocks.map((b, i) => (
              <View key={i} style={{ gap: 6, marginTop: 4 }}>
                <T style={F.label}>{b.title}{b.rounds ? ` · ${b.rounds} rounds, ${b.workSec}s on / ${b.restSec}s off` : ''}</T>
                {b.items.map((it) => {
                  const ex = getExercise(it.exerciseId);
                  return (
                    <Pressable key={it.exerciseId} onPress={() => router.push(`/exercise/${it.exerciseId}`)} accessibilityRole="link">
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T style={{ flex: 1 }} numberOfLines={1}>{ex?.name}</T>
                        <T style={F.small}>
                          {b.type === 'strength' ? `${it.sets} × ${it.reps ? `${it.reps[0]}–${it.reps[1]}` : `${it.seconds}s`}` : `${it.seconds}s`}
                        </T>
                      </Row>
                    </Pressable>
                  );
                })}
              </View>
            )) : null}
          </Card>
        );
      })}

      {plan.notes.map((n) => <T key={n} style={F.small}>• {n}</T>)}
      <Button title="Change goals, time or equipment" kind="secondary" icon="options" onPress={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })} />
    </Screen>
  );
}
