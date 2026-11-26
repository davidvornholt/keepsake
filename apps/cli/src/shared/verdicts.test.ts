import { describe, expect, it } from 'bun:test';
import type { Verdict } from './domain.ts';
import { joined } from './verdicts.ts';

const verdict = (
  photos: ReadonlyArray<string>,
  score: number,
  further: Verdict['further'] = [],
): Verdict => ({
  moment: photos[0] ?? '',
  photos,
  model: 'codex/model',
  best: photos.toReversed(),
  score,
  subject: 'bird',
  description: `${photos[0]} at its best`,
  reason: `why ${photos[0]}`,
  further,
});

const moment = { id: 'A', photos: ['A', 'B', 'C', 'D'] };

describe('joined', () => {
  it('lets the best part lead and keeps the others next to it', () => {
    const further = [{ photo: 'A', score: 5, description: 'A too' }];
    const whole = joined(moment, [
      verdict(['A', 'B'], 6, further),
      verdict(['C', 'D'], 8),
    ]);
    expect(whole).toEqual({
      moment: 'A',
      photos: ['A', 'B', 'C', 'D'],
      model: 'codex/model',
      best: ['D', 'C', 'B', 'A'],
      score: 8,
      subject: 'bird',
      description: 'C at its best',
      reason: 'why C',
      further: [
        { photo: 'B', score: 6, description: 'A at its best' },
        ...further,
      ],
    });
  });

  it('lets the earlier part lead when both score the same', () => {
    const both = joined(moment, [
      verdict(['C', 'D'], 7),
      verdict(['A', 'B'], 7),
    ]);
    expect(both?.best[0]).toBe('B');
  });

  it('joins only parts that make up the moment', () => {
    expect(joined(moment, [verdict(['A', 'B'], 6)])).toBeNull();
    expect(
      joined(moment, [verdict(['A', 'B', 'C'], 6), verdict(['C', 'D'], 6)]),
    ).toBeNull();
    expect(joined(moment, [])).toBeNull();
  });
});
