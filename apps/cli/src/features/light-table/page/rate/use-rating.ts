import { useMemo, useState } from 'react';
import type { ShootView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { prefersReducedMotion } from '../ui/theme.ts';
import {
  answerOf,
  nextOpen,
  type Step,
  stepAt,
  turned,
  withKept,
} from './rating.ts';

// Where the owner is in rating, and what each answer does.

type Asked = NonNullable<ShootView['rating']>;

/** How long the stars are looked at before the next moment comes, in milliseconds. */
const stampTime = 300;

export type Saving = {
  readonly stars: number;
  /** When the answer was given, in milliseconds, so the stars are drawn from then. */
  readonly since: number;
};

export const useRating = ({ questions, ratings: given }: Asked) => {
  const { store } = useShootContext();
  const ratings = useMemo(
    () => new Map(given.map((rating) => [rating.moment, rating])),
    [given],
  );
  const [step, setStep] = useState<Step>(() =>
    stepAt(questions, ratings, nextOpen(questions, ratings, -1)),
  );
  const [saving, setSaving] = useState<Saving | null>(null);
  /** The side a photo comes in from: the next moment, or a neighbour. */
  const [side, setSide] = useState<-1 | 0 | 1>(0);
  const question = questions[step.at];

  const rate = async (stars: number) => {
    const answer = answerOf(question, step, stars);
    if (answer === null || saving !== null) {
      return;
    }
    setSaving({ stars: answer.stars, since: performance.now() });
    const [isSaved] = await Promise.all([
      store.rate(answer),
      new Promise((done) =>
        setTimeout(done, prefersReducedMotion() ? 0 : stampTime),
      ),
    ]);
    setSaving(null);
    if (isSaved) {
      const known = new Map(ratings).set(answer.moment, answer);
      setSide(1);
      setStep(stepAt(questions, known, nextOpen(questions, known, step.at)));
    }
  };

  return {
    questions,
    question,
    ratings,
    step,
    saving,
    side,
    rate: (stars: number) => {
      rate(stars).catch(() => setSaving(null));
    },
    back: () => {
      if (step.at > 0 && saving === null) {
        setSide(-1);
        setStep(stepAt(questions, ratings, step.at - 1));
      }
    },
    /** Shows a photo large, to be rated as the best of its moment. */
    choose: (shown: number) => {
      setSide(0);
      setStep((now) => ({ ...now, shown }));
    },
    compare: () => setStep((now) => ({ ...now, shown: null })),
    turn: (by: -1 | 1): boolean => {
      const count = question?.photos.length ?? 0;
      if (step.shown === null || count < 2) {
        return false;
      }
      setSide(by);
      setStep((now) => turned(now, count, by));
      return true;
    },
    toggleKept: (photo: string) => setStep((now) => withKept(now, photo)),
  };
};

export type RatingFlow = ReturnType<typeof useRating>;
