import { describe, expect, it } from 'bun:test';
import { isBlock, picture, valueAt } from '../pixels/test-pictures.ts';
import { takePlace, takings } from './take-place.ts';

const size = { width: 900, height: 600 };
const place = { left: 400, top: 220, right: 520, bottom: 320 };
const box = {
  left: place.left / size.width,
  top: place.top / size.height,
  right: place.right / size.width,
  bottom: place.bottom / size.height,
};
/** Something that has to go, in a part of the place. */
const isThing = (x: number, y: number) =>
  x >= 430 && x < 460 && y >= 250 && y < 290;
const wall = (x: number, y: number) => (isBlock(x, y) ? 150 : 120);
const darker = (value: number) => Math.round(value * 0.9);

const unchanged = () =>
  picture(size, (x, y) => (isThing(x, y) ? 20 : wall(x, y)));
/** An edit without the thing, a little darker and with a redrawn texture. */
const version = picture(size, (x, y) =>
  darker(isBlock(x, y) === (x % 9 === 0) ? 120 : 150),
);

describe('takePlace', () => {
  it.each(takings)(
    'takes what changed, in the light there is: %s',
    (taking) => {
      const changed = unchanged();
      takePlace(version, changed, box, { places: [box], taking });
      for (let y = 255; y < 285; y += 3) {
        for (let x = 435; x < 455; x += 3) {
          expect(valueAt(changed, x, y)).toBeGreaterThan(100);
        }
      }
    },
  );

  it.each(takings)('leaves everything around the place: %s', (taking) => {
    const changed = unchanged();
    takePlace(version, changed, box, { places: [box], taking });
    const same = unchanged();
    for (let y = 0; y < size.height; y += 7) {
      for (let x = 0; x < size.width; x += 7) {
        const isNear = x > 340 && x < 580 && y > 160 && y < 380;
        const expected = isNear ? valueAt(changed, x, y) : valueAt(same, x, y);
        expect(valueAt(changed, x, y)).toBe(expected);
      }
    }
  });

  it.each(takings)('reaches the border of a moved version: %s', (taking) => {
    const down = 3;
    const isLow = (x: number, y: number) => isThing(x, y - 309);
    const moved = picture(size, (x, y) => wall(x, y - down));
    const changed = picture(size, (x, y) => (isLow(x, y) ? 20 : wall(x, y)));
    const low = { ...box, top: 530 / size.height, bottom: 1 };
    takePlace(moved, changed, low, { places: [low], taking });
    for (let x = 435; x < 455; x += 3) {
      expect(valueAt(changed, x, size.height - 1)).toBeGreaterThan(100);
      expect(valueAt(changed, x, size.height - 20)).toBeGreaterThan(100);
    }
  });

  it('leaves what didn’t change in the place, if only that is wanted', () => {
    const changed = unchanged();
    const all = unchanged();
    takePlace(version, changed, box, { places: [box], taking: 'changed' });
    takePlace(version, all, box, { places: [box], taking: 'all' });
    const same = unchanged();
    const differs = (picked: typeof same) =>
      Array.from(
        { length: 30 },
        (_, step) =>
          valueAt(picked, 490 + step, 300) !== valueAt(same, 490 + step, 300),
      ).filter(Boolean).length;
    expect(differs(changed)).toBe(0);
    expect(differs(all)).toBeGreaterThan(5);
  });
});
