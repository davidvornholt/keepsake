import { describe, expect, it } from 'bun:test';
import { breaksOf, type Piece, scaleOf, widthOf } from './rows.ts';

const pieces = (count: number, width = 60, before = 4): Array<Piece> =>
  Array.from({ length: count }, () => ({ width, before }));

/** By how much each row has to grow to fill the room. */
const scalesOf = (all: ReadonlyArray<Piece>, room: number) => {
  let from = 0;
  return breaksOf(all, room).map((to) => {
    const { frames, gaps } = widthOf(all, from, to);
    from = to;
    return scaleOf(frames, gaps, room);
  });
};

describe('breaksOf', () => {
  it('ends the last row with the last piece', () => {
    expect(breaksOf(pieces(40), 600).at(-1)).toBe(40);
    expect(breaksOf([], 600)).toEqual([]);
  });

  it('keeps every row near the height asked for, the last one too', () => {
    for (const count of [9, 10, 11, 17, 40, 41, 43, 200]) {
      for (const scale of scalesOf(pieces(count), 600)) {
        expect(scale).toBeGreaterThan(0.74);
        expect(scale).toBeLessThan(1.42);
      }
    }
  });

  it('takes a piece more instead of leaving one alone in a row', () => {
    // Four fit as asked for; a fifth would be alone in the row below.
    const room = 4 * 60 + 3 * 4;
    expect(breaksOf(pieces(5), room)).toEqual([5]);
  });

  it('gives a piece wider than the room a row of its own', () => {
    const all = [...pieces(3), { width: 900, before: 4 }, ...pieces(3)];
    const ends = breaksOf(all, 200);
    expect(ends).toContain(3);
    expect(ends).toContain(4);
  });

  it('lays pieces of many widths', () => {
    const all = Array.from({ length: 60 }, (_, at) => ({
      width: at % 4 === 0 ? 40 : 90,
      before: at % 3 === 0 ? 12 : 3,
    }));
    for (const scale of scalesOf(all, 500)) {
      expect(scale).toBeGreaterThan(0.74);
      expect(scale).toBeLessThan(1.42);
    }
  });
});

describe('widthOf', () => {
  it('counts no gap before the first piece of a row', () => {
    expect(widthOf(pieces(3))).toEqual({ frames: 180, gaps: 8 });
    expect(widthOf(pieces(3), 1, 2)).toEqual({ frames: 60, gaps: 0 });
  });
});
