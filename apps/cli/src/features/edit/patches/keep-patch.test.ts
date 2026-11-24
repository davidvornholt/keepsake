import { describe, expect, it } from 'bun:test';
import { isBlock, picture, valueAt } from '../pixels/test-pictures.ts';
import { keepPatch } from './keep-patch.ts';

const size = { width: 600, height: 400 };
const place = { left: 280, top: 160, right: 320, bottom: 240 };
const box = {
  left: place.left / size.width,
  top: place.top / size.height,
  right: place.right / size.width,
  bottom: place.bottom / size.height,
};
const shift = { x: 6, y: -4 };

const isPlace = (x: number, y: number) =>
  x >= place.left && x < place.right && y >= place.top && y < place.bottom;
const wall = (x: number, y: number) => (isBlock(x, y) ? 90 : 50);
/** Somebody, and the stripes an image model made of them. */
const somebody = (x: number, y: number) => (isBlock(x * 2, y * 2) ? 80 : 40);
const stripes = (x: number) => (Math.floor(x / 7) % 2 === 0 ? 220 : 10);

const original = picture(size, (x, y) =>
  isPlace(x, y) ? somebody(x, y) : wall(x, y),
);
const edited = (light: (value: number) => number) =>
  picture(size, (column, row) => {
    const x = column - shift.x;
    const y = row - shift.y;
    return isPlace(x, y) ? stripes(x) : light(wall(x, y));
  });
const brighter = (value: number) => value * 1.4;

describe('keepPatch', () => {
  it('puts somebody where the edit has them, in its light', () => {
    const edit = edited(brighter);
    expect(keepPatch(original, edit, box, [box])).toBe(true);
    for (let y = place.top + 4; y < place.bottom - 4; y += 5) {
      for (let x = place.left + 4; x < place.right - 4; x += 5) {
        const value = valueAt(edit, x + shift.x, y + shift.y);
        expect(Math.abs(value - brighter(somebody(x, y)))).toBeLessThan(25);
      }
    }
  });

  it('changes nothing elsewhere', () => {
    const edit = edited(brighter);
    const before = edited(brighter);
    keepPatch(original, edit, box, [box]);
    for (const [x, y] of [
      [250, 200],
      [360, 200],
      [300, 130],
      [300, 270],
    ] as const) {
      expect(valueAt(edit, x, y)).toBe(valueAt(before, x, y));
    }
  });

  it('leaves an edit that shows something else there', () => {
    const other = (x: number, y: number) => (isBlock(y, x + 300) ? 230 : 20);
    const edit = picture(size, other);
    const before = picture(size, other);
    expect(keepPatch(original, edit, box, [box])).toBe(false);
    expect(edit.pixels).toEqual(before.pixels);
  });

  it('leaves an edit of what is almost black', () => {
    const dark = picture(size, (x, y) =>
      isPlace(x, y) ? 4 : Math.round(wall(x, y) / 12),
    );
    const edit = edited(brighter);
    const before = edited(brighter);
    expect(keepPatch(dark, edit, box, [box])).toBe(false);
    expect(edit.pixels).toEqual(before.pixels);
  });
});
