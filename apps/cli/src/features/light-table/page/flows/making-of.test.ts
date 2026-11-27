import { describe, expect, it } from 'bun:test';
import type { ShootView } from '../../contract.ts';
import { indexOf } from '../data/derive.ts';
import { samplePhoto, sampleShoot } from '../data/sample.ts';
import { makingOf } from './making-of.ts';

const at = '2026-05-21T10:00:00.000Z';
const picked = samplePhoto('a', { standing: { kind: 'picked' } });
const undecided = samplePhoto('b', { standing: { kind: 'open' } });
const making = (shoot: ShootView) =>
  makingOf({ index: indexOf(shoot), state: shoot });

describe('makingOf', () => {
  it('is getting ready for as long as keepsake prepares, or stopped at it', () => {
    expect(
      making({
        ...sampleShoot([undecided]),
        preparation: { since: at, stopped: null },
      }),
    ).toBe('ready');
    expect(
      making({
        ...sampleShoot([picked]),
        preparation: { since: at, stopped: 'The usage limit is reached.' },
      }),
    ).toBe('ready');
  });

  it('is a choice to go over until it is ordered', () => {
    expect(making(sampleShoot([picked, undecided]))).toBe('chosen');
    expect(
      making({
        ...sampleShoot([picked]),
        ordered: { at, dollars: 0.75, photos: ['a'] },
      }),
    ).toBe('ordered');
  });

  it('is over once there is an album, and nothing while nothing is chosen', () => {
    expect(making(sampleShoot([samplePhoto('a'), picked]))).toBeNull();
    expect(making(sampleShoot([undecided]))).toBeNull();
  });
});
