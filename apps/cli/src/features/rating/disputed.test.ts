import { describe, expect, it } from 'bun:test';
import type { Moment, Verdict } from '../../shared/domain.ts';
import { disputedBetween } from './disputed.ts';

const burst = (id: string, count = 2): Moment => ({
  id,
  photos: Array.from({ length: count }, (_, index) => `${id}${index + 1}`),
});

const verdict = (moment: Moment, best: number, score: number): Verdict => ({
  moment: moment.id,
  photos: moment.photos,
  model: 'azure/gpt-6-astra',
  best: moment.photos.slice(best - 1, best),
  score,
  subject: 'other',
  description: '',
  reason: '',
  further: [],
});

const ids = (moments: ReadonlyArray<Moment>) =>
  new Set(moments.map(({ id }) => id));

describe('disputedBetween', () => {
  it('takes moments with another best frame that one model likes', () => {
    const [liked, same, disliked] = [burst('A'), burst('B'), burst('C')];
    const disputed = disputedBetween(
      [liked, same, disliked],
      [
        [verdict(liked, 1, 7), verdict(same, 1, 6), verdict(disliked, 1, 3)],
        [verdict(liked, 2, 7), verdict(same, 1, 6), verdict(disliked, 2, 2)],
      ],
      10,
    );
    expect(ids(disputed)).toEqual(new Set(['A']));
  });

  it('takes moments that only one model likes, however it uses the scale', () => {
    const moments = ['A', 'B', 'C', 'D'].map((id) => burst(id, 1));
    const verdictsWith = (scores: ReadonlyArray<number>) =>
      moments.map((moment, index) => verdict(moment, 1, scores[index] ?? 0));
    // The second model gives everything two points less, and swaps A and D.
    const disputed = disputedBetween(
      moments,
      [verdictsWith([9, 8, 7, 6]), verdictsWith([4, 6, 5, 7])],
      10,
    );
    expect(ids(disputed)).toEqual(new Set(['A', 'D']));
  });

  it('takes the most disputed ones first, of both kinds', () => {
    const frames = [burst('A'), burst('B')];
    const scores = [burst('C', 1), burst('D', 1)];
    const judged = (best: number, [a, b, c, d]: ReadonlyArray<number>) =>
      [...frames, ...scores].map((moment, index) =>
        verdict(
          moment,
          index < frames.length ? best : 1,
          [a, b, c, d][index] ?? 0,
        ),
      );
    const disputed = disputedBetween(
      [...frames, ...scores],
      [judged(1, [6, 8, 2, 5]), judged(2, [6, 8, 9, 5])],
      2,
    );
    expect(ids(disputed)).toEqual(new Set(['B', 'C']));
  });

  it('leaves out what one of them did not judge, and what is too much', () => {
    const [alone, many] = [burst('A'), burst('B', 13)];
    const disputed = disputedBetween(
      [alone, many],
      [[verdict(alone, 1, 8), verdict(many, 1, 8)], [verdict(many, 2, 8)]],
      10,
    );
    expect(disputed).toEqual([]);
  });
});
