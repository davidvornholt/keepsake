import { describe, expect, it } from 'bun:test';
import {
  barHeight,
  fitIn,
  halves,
  infoWidth,
  insetOf,
  mirrored,
  roomOf,
  stripHeight,
  wideOf,
} from './room.ts';

const chrome = {
  isInfoShown: true,
  isComposing: false,
  extra: 0,
  measured: 0,
};

describe('roomOf', () => {
  it('leaves room for the notes beside the photo on a wide window', () => {
    const room = roomOf({ width: 1440, height: 900 }, chrome);
    expect(room.x + room.w).toBeLessThanOrEqual(1440 - infoWidth);
    expect(room.y).toBe(stripHeight);
    expect(room.y + room.h).toBeLessThanOrEqual(900 - barHeight);
  });

  it('gives the photo the whole width when the notes are put away', () => {
    const wide = roomOf(
      { width: 1440, height: 900 },
      { ...chrome, isInfoShown: false },
    );
    expect(wide.w).toBeGreaterThan(1440 - infoWidth);
    const phone = roomOf({ width: 412, height: 915 }, chrome);
    expect(phone.w).toBe(400);
  });

  it('gives way to what lies below the photo when that is higher than expected', () => {
    const plain = roomOf({ width: 412, height: 915 }, chrome);
    const pushed = roomOf(
      { width: 412, height: 915 },
      { ...chrome, measured: barHeight + 60 },
    );
    expect(plain.h - pushed.h).toBe(60);
    const lower = roomOf(
      { width: 412, height: 915 },
      { ...chrome, measured: 20 },
    );
    expect(lower).toEqual(plain);
  });

  it('makes room for the words of a change', () => {
    const plain = roomOf({ width: 1440, height: 900 }, chrome);
    const composing = roomOf(
      { width: 1440, height: 900 },
      { ...chrome, isComposing: true },
    );
    expect(composing.h).toBeLessThan(plain.h);
  });
});

describe('halves', () => {
  it('puts two photos side by side in a wide room, and one above the other in a tall one', () => {
    const [left, right] = halves({ x: 0, y: 0, w: 1000, h: 600 });
    expect(left.w).toBe(right.w);
    expect(right.x).toBeGreaterThan(left.w);
    const [top, bottom] = halves({ x: 0, y: 0, w: 400, h: 800 });
    expect(top.w).toBe(400);
    expect(bottom.y).toBeGreaterThan(top.h);
  });
});

describe('fitIn', () => {
  it('fits a shape into the middle of a room', () => {
    expect(fitIn({ x: 0, y: 0, w: 600, h: 600 }, 2)).toEqual({
      x: 0,
      y: 150,
      w: 600,
      h: 300,
    });
    expect(fitIn({ x: 10, y: 0, w: 600, h: 300 }, 1)).toEqual({
      x: 160,
      y: 0,
      w: 300,
      h: 300,
    });
  });
});

describe('wideOf', () => {
  it('is the whole window, but for the notes beside the photo', () => {
    expect(wideOf({ width: 1440, height: 900 }, false)).toEqual({
      x: 0,
      y: 0,
      w: 1440,
      h: 900,
    });
    expect(wideOf({ width: 1440, height: 900 }, true).w).toBe(1440 - infoWidth);
    expect(wideOf({ width: 412, height: 915 }, true).w).toBe(412);
  });
});

describe('mirrored', () => {
  const rest = { x: 100, y: 100, w: 400, h: 300 };
  const theirs = { x: 600, y: 120, w: 360, h: 270 };

  it('leaves the photo beside one where it is while that one rests or is swiped', () => {
    expect(mirrored({ now: rest, rest }, theirs)).toEqual(theirs);
    const swiped = { ...rest, x: 40 };
    expect(mirrored({ now: swiped, rest }, theirs)).toEqual(theirs);
    const smaller = { x: 150, y: 140, w: 300, h: 225 };
    expect(mirrored({ now: smaller, rest }, theirs)).toEqual(theirs);
  });

  it('shows the same spot of both, each as much larger', () => {
    const now = { x: 100, y: 100, w: 1600, h: 1200 };
    const beside = mirrored({ now, rest }, theirs);
    expect(beside.w).toBeCloseTo(theirs.w * 4);
    expect(beside.h).toBeCloseTo(theirs.h * 4);
    // What is in the middle of the one's room is in the middle of the other's.
    const spot = (rest.x + rest.w / 2 - now.x) / now.w;
    const spotBeside = (theirs.x + theirs.w / 2 - beside.x) / beside.w;
    expect(spotBeside).toBeCloseTo(spot);
  });
});

describe('insetOf', () => {
  it('says how far a part is from each side of the window', () => {
    expect(
      insetOf({ x: 10, y: 20, w: 300, h: 400 }, { width: 800, height: 600 }),
    ).toBe('20px 490px 180px 10px');
  });
});
