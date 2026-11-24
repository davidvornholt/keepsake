import { describe, expect, it } from 'bun:test';
import type { Moment, Verdict } from '../../shared/domain.ts';
import { sampleOf } from './sample.ts';

const moments: ReadonlyArray<Moment> = Array.from(
  { length: 40 },
  (_, index) => ({
    id: `M${index}`,
    photos:
      index < 4 ? [`M${index}`, `M${index}b`, `M${index}c`] : [`M${index}`],
  }),
);

const verdict = (moment: string, score: number): Verdict => ({
  moment,
  photos: [moment],
  model: 'azure/gpt-6-astra',
  best: [moment],
  score,
  subject: 'other',
  description: '',
  reason: '',
  further: [],
});

describe('sampleOf', () => {
  it('takes bursts and single photos alike, however few there are', () => {
    const sample = sampleOf(moments, [], 8);
    expect(sample).toHaveLength(8);
    expect(sample.filter(({ photos }) => photos.length > 1)).toHaveLength(4);
  });

  it('takes some with every score', () => {
    const verdicts = moments.map(({ id }, index) =>
      verdict(id, index === 39 ? 9 : 2),
    );
    const sample = sampleOf(moments, verdicts, 6);
    expect(sample.map(({ id }) => id)).toContain('M39');
  });

  it('leaves out moments with too many photos to compare', () => {
    const many: Moment = {
      id: 'many',
      photos: Array.from({ length: 13 }, (_, index) => `many${index}`),
    };
    const sample = sampleOf([...moments, many], [], 100);
    expect(sample).not.toContain(many);
  });

  it('is the same every time', () => {
    expect(sampleOf(moments, [], 10)).toEqual(sampleOf(moments, [], 10));
  });

  it('is everything when there is less than asked for', () => {
    expect(sampleOf(moments, [], 100)).toHaveLength(40);
  });
});
