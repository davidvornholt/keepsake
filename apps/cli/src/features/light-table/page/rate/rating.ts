import type { Question } from '../../contract.ts';
import type { Rating } from '../data/api.ts';

// Rating as a walk through the moments the owner was asked about: for each,
// the best photo is chosen from all of them, then it gets its stars.

/** What the stars mean, from none to five. */
export const starNames = [
  'throw away',
  'ordinary',
  'good',
  'for the album',
  'for the wall',
  'best of the year',
] as const;

export type Step = {
  /** Which question, or as many as there are once all are answered. */
  readonly at: number;
  /** The photo shown large, or null while the moment's photos are compared. */
  readonly shown: number | null;
  /** The photos of the moment to keep next to the best one. */
  readonly kept: ReadonlySet<string>;
};

type Questions = ReadonlyArray<Question>;
type Ratings = ReadonlyMap<string, Rating>;

/** What the owner is asked now. */
export const questionOf = (questions: Questions, step: Step): string => {
  const question = questions[step.at];
  if (question === undefined) {
    return questions.length === 1
      ? 'The moment is rated.'
      : `All ${questions.length} are rated.`;
  }
  const count = question.photos.length;
  if (step.shown === null) {
    return `Which of these ${count} photos is best?`;
  }
  return count === 1
    ? 'How good is this photo?'
    : `Photo ${step.shown + 1} of ${count} is best. How good is it?`;
};

/** A question as it is first shown: with its earlier answer, if it has one. */
export const stepAt = (
  questions: Questions,
  ratings: Ratings,
  wanted: number,
): Step => {
  const at = Math.min(Math.max(wanted, 0), questions.length);
  const question = questions[at];
  const rating = ratings.get(question?.moment ?? '');
  const best = rating?.best ?? null;
  const chosen = best === null ? -1 : (question?.photos.indexOf(best) ?? -1);
  const alone = question?.photos.length === 1 ? 0 : null;
  return {
    at,
    shown: chosen === -1 ? alone : chosen,
    kept: new Set(rating?.further),
  };
};

/** The next question without an answer, or an earlier one that was skipped. */
export const nextOpen = (
  questions: Questions,
  ratings: Ratings,
  after: number,
): number => {
  const isOpen = ({ moment }: Question) => !ratings.has(moment);
  const next = questions.findIndex(
    (question, at) => at > after && isOpen(question),
  );
  const open = next === -1 ? questions.findIndex(isOpen) : next;
  return open === -1 ? questions.length : open;
};

/**
 * The answer that so many stars give. Stars are for the photo shown; while
 * several are compared, only "none of them" is an answer.
 */
export const answerOf = (
  question: Question | undefined,
  step: Step,
  stars: number,
): Rating | null => {
  const isAnswer = step.shown !== null || stars === 0;
  if (question === undefined || !isAnswer) {
    return null;
  }
  const best = stars === 0 ? null : (question.photos[step.shown ?? -1] ?? null);
  return {
    moment: question.moment,
    best,
    stars: best === null ? 0 : stars,
    further:
      best === null
        ? []
        : question.photos.filter((id) => id !== best && step.kept.has(id)),
  };
};

/** The photo before or after the one shown, around the ends. */
export const turned = (step: Step, count: number, by: -1 | 1): Step =>
  step.shown === null || count < 2
    ? step
    : { ...step, shown: (step.shown + by + count) % count };

export const withKept = (step: Step, photo: string): Step => {
  const kept = new Set(step.kept);
  if (!kept.delete(photo)) {
    kept.add(photo);
  }
  return { ...step, kept };
};

/** One entry for each star, to draw them from. */
export const starsUpTo = (stars: number): ReadonlyArray<number> =>
  Array.from({ length: stars }, (_, at) => at);
