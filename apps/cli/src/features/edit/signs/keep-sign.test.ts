import { describe, expect, it } from 'bun:test';
import { isBlock, picture, valueAt } from '../pixels/test-pictures.ts';
import { keepSign } from './keep-sign.ts';

const size = { width: 900, height: 600 };
const place = { left: 300, top: 200, right: 420, bottom: 240 };
const sign = {
  text: 'HOTEL',
  box: {
    left: place.left / size.width,
    top: place.top / size.height,
    right: place.right / size.width,
    bottom: place.bottom / size.height,
  },
};
const shift = { x: 9, y: -5 };
const letter = 230;
const board = 30;

const isSign = (x: number, y: number) =>
  x >= place.left && x < place.right && y >= place.top && y < place.bottom;
/** Letters, and other letters an image model made of them. */
const isLetter = (x: number) => Math.floor(x / 6) % 3 === 0;
const isOtherLetter = (x: number) => Math.floor(x / 9) % 2 === 0;

const wall = (x: number, y: number) => (isBlock(x, y) ? 60 : 30);

const original = picture(size, (x, y) => {
  if (!isSign(x, y)) {
    return wall(x, y);
  }
  return isLetter(x) ? letter : board;
});
const edited = () =>
  picture(size, (column, row) => {
    const x = column - shift.x;
    const y = row - shift.y;
    if (!isSign(x, y)) {
      return wall(x, y) * 2;
    }
    return isOtherLetter(x) ? letter : board * 2;
  });

describe('keepSign', () => {
  it('puts the photo’s letters where the edit has the sign', () => {
    const edit = edited();
    keepSign(original, edit, sign, [sign]);
    for (let x = place.left; x < place.right; x += 1) {
      const value = valueAt(edit, x + shift.x, 220 + shift.y);
      expect(value > 150).toBe(isLetter(x));
    }
  });

  it('takes over the light of the edit', () => {
    const edit = edited();
    keepSign(original, edit, sign, [sign]);
    const around = { x: place.left - 4 + shift.x, y: 220 + shift.y };
    expect(valueAt(edit, around.x, around.y)).toBeGreaterThan(
      valueAt(original, place.left - 4, 220) * 1.3,
    );
  });

  it('changes nothing elsewhere', () => {
    const edit = edited();
    const before = edited();
    keepSign(original, edit, sign, [sign]);
    for (const [x, y] of [
      [200, 220],
      [480, 220],
      [360, 150],
      [360, 300],
    ] as const) {
      expect(valueAt(edit, x, y)).toBe(valueAt(before, x, y));
    }
  });

  it('keeps a sign at the corner of the photo', () => {
    const edit = edited();
    const corner = {
      text: 'EXIT',
      box: { left: 0, top: 0, right: 0.05, bottom: 0.05 },
    };
    keepSign(original, edit, corner, [corner]);
    expect(edit.pixels).toHaveLength(original.pixels.length);
  });
});
