import { describe, expect, it } from 'bun:test';
import { apart, type Place } from './places.ts';

const place = (
  what: string,
  [left, right]: readonly [number, number],
  isRemoval = true,
): Place => ({
  what: [what],
  isRemoval,
  box: { left, top: 0.2, right, bottom: 0.3 },
});

describe('apart', () => {
  it('leaves places that don’t touch', () => {
    const places = [place('a', [0.1, 0.2]), place('b', [0.3, 0.4])];
    expect(apart(places)).toEqual(places);
  });

  it('makes one of places that touch, also through others', () => {
    expect(
      apart([
        place('a', [0.1, 0.2]),
        place('b', [0.3, 0.4], false),
        place('c', [0.6, 0.7]),
        place('d', [0.195, 0.305]),
      ]),
    ).toEqual([
      place('c', [0.6, 0.7]),
      { ...place('', [0.1, 0.4], false), what: ['b', 'a', 'd'] },
    ]);
  });
});
