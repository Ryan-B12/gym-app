/**
 * Simple pre-exercise health check. Any "yes" turns on gentle mode and
 * asks the user to get a doctor's OK. Have a professional review this wording before launch.
 */
export const SCREENING_QUESTIONS = [
  { id: 'heart', text: 'Has a doctor ever said you have a heart condition or high blood pressure?' },
  { id: 'chest_pain', text: 'Do you get chest pain at rest, during daily activities, or when you exercise?' },
  { id: 'dizzy', text: 'Have you lost balance from dizziness or passed out in the past year?' },
  { id: 'chronic', text: 'Do you have another ongoing health condition (like diabetes, asthma or a lung condition)?' },
  { id: 'meds', text: 'Do you take prescription medicine for a long-term condition?' },
  { id: 'injury', text: 'Do you have a bone, joint or muscle problem that could get worse with exercise?' },
  { id: 'pregnant', text: 'Are you pregnant or have you given birth in the last 6 months?' },
  { id: 'advised', text: 'Has a doctor told you to only exercise under medical supervision?' },
] as const;

export type ScreeningAnswers = Record<string, boolean>;

export function screeningFlagged(answers: ScreeningAnswers): boolean {
  return SCREENING_QUESTIONS.some((q) => answers[q.id] === true);
}

/** Users under 18 can't sign up (needed for money stakes and App Store age rating). */
export function oldEnough(birthYear: number | null, now = new Date()): boolean | null {
  if (birthYear == null) return null;
  return now.getFullYear() - birthYear >= 18;
}
