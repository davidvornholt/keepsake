import { describe, expect, it } from 'bun:test';
import { isBlock, picture, valueAt } from '../pixels/test-pictures.ts';
import { keepTexture } from './keep-texture.ts';

const size = { width: 1920, height: 480 };
/** Crowns of trees, a few pixels wide in a small view. */
const crowns = (x: number, y: number) =>
  120 + 60 * Math.sin(x / 9) * Math.sin(y / 9);
const leaves = (x: number, y: number) =>
  (crowns(x, y) + (isBlock(x * 5, y * 5) ? 15 : -15)) * 0.7;
const clumps = (x: number, y: number) =>
  crowns(x, y) + (isBlock(x / 2, y / 2) ? 20 : -20);
const left = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
];
const original = picture(size, leaves);

const averageOf = (values: ReadonlyArray<number>) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('keepTexture', () => {
  it('gives an edit the photo’s own texture in its own light', () => {
    const edit = picture(size, clumps);
    keepTexture(original, edit, [left]);
    const fromLeaf: Array<number> = [];
    const all: Array<number> = [];
    for (let y = 50; y < 430; y += 1) {
      for (let x = 50; x < 800; x += 2) {
        const value = valueAt(edit, x, y) - crowns(x, y);
        all.push(value);
        fromLeaf.push(isBlock(x * 5, y * 5) ? value : -value);
      }
    }
    expect(averageOf(fromLeaf)).toBeGreaterThan(8);
    expect(Math.abs(averageOf(all))).toBeLessThan(4);
  });

  it('keeps the grain of what looks flat from afar, such as asphalt', () => {
    const asphalt = picture(
      size,
      (x, y) => 100 + (isBlock(x * 5, y * 5) ? 6 : -6),
    );
    const edit = picture(size, () => 130);
    keepTexture(asphalt, edit, [left]);
    const fromGrain: Array<number> = [];
    for (let y = 50; y < 430; y += 1) {
      for (let x = 50; x < 800; x += 2) {
        const value = valueAt(edit, x, y) - 130;
        fromGrain.push(isBlock(x * 5, y * 5) ? value : -value);
      }
    }
    expect(averageOf(fromGrain)).toBeGreaterThan(4);
  });

  it('leaves an edit as it is where the photo is almost black', () => {
    const night = picture(size, (x, y) => 8 + (isBlock(x, y) ? 4 : -4));
    const edit = picture(size, clumps);
    const before = picture(size, clumps);
    keepTexture(night, edit, [left]);
    expect(edit.pixels).toEqual(before.pixels);
  });

  it('changes nothing outside the outlines', () => {
    const edit = picture(size, clumps);
    const before = picture(size, clumps);
    keepTexture(original, edit, [left]);
    expect(valueAt(edit, 1000, 100)).toBe(valueAt(before, 1000, 100));
    expect(valueAt(edit, 1700, 400)).toBe(valueAt(before, 1700, 400));
    const untouched = picture(size, clumps);
    keepTexture(original, untouched, []);
    expect(untouched.pixels).toEqual(before.pixels);
  });

  it('fades to where the photo ends in a picture that goes on', () => {
    const edit = picture(size, clumps);
    const before = picture(size, clumps);
    keepTexture(original, edit, [left], {
      left: 0,
      top: 0,
      right: 0.4,
      bottom: 1,
    });
    const changeAt = (from: number, to: number) => {
      const changes: Array<number> = [];
      for (let y = 50; y < 430; y += 1) {
        for (let x = from; x < to; x += 1) {
          changes.push(Math.abs(valueAt(edit, x, y) - valueAt(before, x, y)));
        }
      }
      return averageOf(changes);
    };
    expect(changeAt(772, 900)).toBe(0);
    expect(changeAt(730, 750)).toBeLessThan(changeAt(400, 420) / 4);
  });
});
