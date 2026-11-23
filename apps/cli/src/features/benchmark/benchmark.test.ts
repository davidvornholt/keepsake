import { describe, expect, it } from 'bun:test';
import type { Rating, Verdict } from '../../shared/domain.ts';
import {
  compareWithOwner,
  keepAccuracy,
  rankCorrelation,
} from './benchmark.ts';

const pairs = (...values: ReadonlyArray<readonly [number, number]>) =>
  values.map(([score, stars]) => ({ score, stars }));

describe('keepAccuracy', () => {
  it('is 1 when every kept photo scores higher', () => {
    expect(keepAccuracy(pairs([8, 4], [7, 3], [5, 2], [2, 0]))).toBe(1);
  });

  it('is a half when scores tell nothing', () => {
    expect(keepAccuracy(pairs([6, 4], [6, 0]))).toBe(0.5);
  });

  it('is nothing when all or none were kept', () => {
    expect(keepAccuracy(pairs([8, 4], [2, 5]))).toBeNull();
  });
});

describe('rankCorrelation', () => {
  it('is 1 for the same order and -1 for the opposite', () => {
    expect(rankCorrelation(pairs([1, 0], [5, 2], [9, 4]))).toBeCloseTo(1);
    expect(rankCorrelation(pairs([9, 0], [5, 2], [1, 4]))).toBeCloseTo(-1);
  });

  it('is nothing when all are the same', () => {
    expect(rankCorrelation(pairs([5, 1], [5, 3]))).toBeNull();
  });
});

const rating = (moment: string, overrides: Partial<Rating>): Rating => ({
  moment,
  photos: [`${moment}1`, `${moment}2`, `${moment}3`, `${moment}4`],
  best: [`${moment}1`],
  stars: 3,
  ...overrides,
});

const verdict = (moment: string, best: string, score: number): Verdict => ({
  moment,
  photos: [],
  model: 'azure/gpt-6-astra',
  best: [best],
  score,
  subject: 'bird',
  description: '',
  reason: '',
});

describe('compareWithOwner', () => {
  it('compares best frames on bursts the owner kept something of', () => {
    const result = compareWithOwner(
      [verdict('A', 'A1', 8), verdict('B', 'B2', 7), verdict('C', 'C1', 2)],
      [
        rating('A', {}),
        rating('B', { best: ['B1', 'B2'], stars: 4 }),
        rating('C', { best: [], stars: 0 }),
        rating('D', {}),
      ],
    );
    expect(result).toEqual({
      moments: 3,
      bursts: 2,
      sameBestFrame: 0.5,
      bestFrameKept: 1,
      bestFrameByChance: 0.375,
      keepAccuracy: 1,
      rankCorrelation: 0.5,
    });
  });
});
