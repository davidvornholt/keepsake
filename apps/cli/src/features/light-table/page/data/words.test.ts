import { describe, expect, it } from 'bun:test';
import { indexOf } from './derive.ts';
import { sampleMark, samplePhoto, sampleShoot } from './sample.ts';
import { exposureLine, standingOf, stateOf } from './words.ts';

const verdict = { score: 6, subject: '', description: '', reason: null };

const said = (change: Parameters<typeof samplePhoto>[1]) => {
  const photo = samplePhoto('a', change);
  return standingOf(indexOf(sampleShoot([photo])), photo);
};

describe('standingOf', () => {
  it('says where a chosen photo stands', () => {
    expect(said({}).text).toBe('In the album');
    expect(said({ standing: { kind: 'picked' } }).text).toBe(
      'Chosen, not in the album yet',
    );
  });

  it('says why a photo was left out, and next to which', () => {
    expect(
      said({
        standing: {
          kind: 'left-out',
          rule: 'repeat',
          repeats: 'b',
          because: 'Same tram.',
        },
      }),
    ).toEqual({
      text: 'Left out: the album shows the same already',
      other: 'b',
      because: 'Same tram.',
    });
    expect(
      said({
        verdict,
        standing: {
          kind: 'left-out',
          rule: 'score',
          repeats: null,
          because: null,
        },
      }).text,
    ).toBe('Left out: scored 6, below 7');
    expect(
      said({
        standing: {
          kind: 'left-out',
          rule: 'no-room',
          repeats: null,
          because: null,
        },
      }).text,
    ).toBe('Left out: the album is full at 170');
    expect(said({ standing: { kind: 'other-frame', of: 'b' } }).other).toBe(
      'b',
    );
  });

  it('says when a photo was taken out, and in whose words why', () => {
    const out = said({
      standing: {
        kind: 'taken-out',
        at: '2026-05-21T12:00:00',
        because: 'Too dark.',
      },
    });
    expect(out.text).toBe('Taken out 21 May');
    expect(out.because).toBe('Too dark.');
  });
});

describe('exposureLine', () => {
  it('lists what the camera wrote down, and leaves out what it didn’t', () => {
    expect(
      exposureLine(
        samplePhoto('a', {
          focalLength: 600,
          aperture: 6.3,
          exposure: 0.001,
          iso: 800,
        }),
      ),
    ).toEqual(['600 mm', 'f/6.3', '1/1000 s', 'ISO 800']);
    expect(exposureLine(samplePhoto('a'))).toEqual([]);
  });
});

describe('stateOf', () => {
  it('says how far a mark has got', () => {
    expect(stateOf(sampleMark('1'))).toBe('Not handed over yet');
    expect(
      stateOf(sampleMark('1', { handedOverAt: '2026-05-21T14:07:00' })),
    ).toBe('Handed over 21 May, 14:07');
    expect(
      stateOf(
        sampleMark('1', {
          handedOverAt: '2026-05-21T14:07:00',
          answer: { outcome: 'not-done', note: '', at: '2026-05-21T15:30:00' },
        }),
      ),
    ).toBe('Not done 21 May, 15:30');
  });
});
