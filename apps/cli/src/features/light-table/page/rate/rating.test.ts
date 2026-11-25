import { describe, expect, it } from 'bun:test';
import type { Rating } from '../data/api.ts';
import {
  answerOf,
  nextOpen,
  questionOf,
  type Step,
  starNames,
  stepAt,
  turned,
  withKept,
} from './rating.ts';

const questions = [
  { moment: 'm1', photos: ['a', 'b', 'c'] },
  { moment: 'm2', photos: ['d'] },
  { moment: 'm3', photos: ['e', 'f'] },
];

const rated = (ratings: ReadonlyArray<Rating>) =>
  new Map(ratings.map((rating) => [rating.moment, rating]));

const none = rated([]);
const step = (change: Partial<Step> = {}): Step => ({
  at: 0,
  shown: null,
  kept: new Set(),
  ...change,
});

describe('questionOf', () => {
  it('asks for the best of several photos, then for its stars', () => {
    expect(questionOf(questions, step())).toBe(
      'Which of these 3 photos is best?',
    );
    expect(questionOf(questions, step({ shown: 1 }))).toBe(
      'Photo 2 of 3 is best. How good is it?',
    );
  });

  it('asks only for the stars of a photo that is alone', () => {
    expect(questionOf(questions, step({ at: 1, shown: 0 }))).toBe(
      'How good is this photo?',
    );
  });

  it('says when everything is rated', () => {
    expect(questionOf(questions, step({ at: 3 }))).toBe('All 3 are rated.');
    expect(questionOf(questions.slice(0, 1), step({ at: 1 }))).toBe(
      'The moment is rated.',
    );
  });

  it('has a name for every number of stars', () => {
    expect(starNames).toHaveLength(6);
  });
});

describe('stepAt', () => {
  it('compares the photos of a moment, and shows one that is alone', () => {
    expect(stepAt(questions, none, 0).shown).toBeNull();
    expect(stepAt(questions, none, 1).shown).toBe(0);
  });

  it('shows the earlier answer again', () => {
    const before = rated([
      { moment: 'm1', best: 'c', stars: 4, further: ['a'] },
    ]);
    const again = stepAt(questions, before, 0);
    expect(again.shown).toBe(2);
    expect([...again.kept]).toEqual(['a']);
  });

  it('stays within the questions', () => {
    expect(stepAt(questions, none, -4).at).toBe(0);
    expect(stepAt(questions, none, 9).at).toBe(3);
  });
});

describe('nextOpen', () => {
  const some = rated([{ moment: 'm2', best: 'd', stars: 2, further: [] }]);

  it('goes on to the next moment without a rating', () => {
    expect(nextOpen(questions, some, 0)).toBe(2);
    expect(nextOpen(questions, none, -1)).toBe(0);
  });

  it('goes back to a moment that was skipped, and ends when none is left', () => {
    expect(nextOpen(questions, some, 2)).toBe(0);
    const all = rated(
      questions.map(({ moment }) => ({
        moment,
        best: null,
        stars: 0,
        further: [],
      })),
    );
    expect(nextOpen(questions, all, 0)).toBe(3);
  });
});

describe('answerOf', () => {
  const [first] = questions;

  it('gives the stars to the photo shown, with those to keep too', () => {
    const shown = step({ shown: 1, kept: new Set(['a', 'b']) });
    expect(answerOf(first, shown, 4)).toEqual({
      moment: 'm1',
      best: 'b',
      stars: 4,
      further: ['a'],
    });
  });

  it('takes no stars while several photos are compared', () => {
    expect(answerOf(first, step(), 3)).toBeNull();
    expect(answerOf(undefined, step({ shown: 0 }), 3)).toBeNull();
  });

  it('keeps nothing when none is worth it', () => {
    expect(answerOf(first, step({ kept: new Set(['a']) }), 0)).toEqual({
      moment: 'm1',
      best: null,
      stars: 0,
      further: [],
    });
    expect(answerOf(first, step({ shown: 2 }), 0)?.best).toBeNull();
  });
});

describe('turning and keeping', () => {
  it('turns through the photos of a moment, around the ends', () => {
    expect(turned(step({ shown: 2 }), 3, 1).shown).toBe(0);
    expect(turned(step({ shown: 0 }), 3, -1).shown).toBe(2);
    expect(turned(step({ shown: 0 }), 1, 1).shown).toBe(0);
    expect(turned(step(), 3, 1).shown).toBeNull();
  });

  it('keeps a photo too, and no longer', () => {
    const kept = withKept(step(), 'a');
    expect([...kept.kept]).toEqual(['a']);
    expect([...withKept(kept, 'a').kept]).toEqual([]);
  });
});
