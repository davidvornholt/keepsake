import { describe, expect, it } from 'bun:test';
import { isBlock, picture } from '../pixels/test-pictures.ts';
import { findPlacement } from './find-placement.ts';
import { placeOf } from './placement.ts';

const size = { width: 1200, height: 800 };
const whole = { left: 0, top: 0, ...size };
/** The photo in a picture that shows more to the left and at the bottom. */
const part = { left: 180, top: 0, width: 1020, height: 680 };

/** A scene of coarse blocks. */
const scene = (x: number, y: number) => (isBlock(x / 4, y / 4) ? 200 : 60);
const original = picture(size, scene);
const extended = picture(size, (x, y) =>
  x >= part.left && y < part.top + part.height ? scene(x, y) : 0,
);

/** An edit that shows the scene larger and further to the side. */
const editWith = (scale: number, offset: { x: number; y: number }) =>
  picture(
    size,
    (x, y) => scene((x - offset.x) / scale, (y - offset.y) / scale) * 0.8 + 40,
  );

describe('findPlacement', () => {
  it.each([
    { scale: 0.97, offset: { x: 18, y: 12 } },
    { scale: 1, offset: { x: 40, y: -25 } },
    { scale: 1.06, offset: { x: -50, y: -10 } },
    { scale: 1.19, offset: { x: -110, y: -60 } },
  ])('finds where an edit shows the photo: %j', ({ scale, offset }) => {
    for (const [from, photo] of [
      [original, whole],
      [extended, part],
    ] as const) {
      const placement = findPlacement(from, editWith(scale, offset), photo);
      for (const { x, y } of [
        { x: 300, y: 100 },
        { x: 1000, y: 600 },
      ]) {
        expect(
          Math.abs(
            placeOf(placement?.x ?? { scale: 0, offset: 0 }, x) -
              (scale * x + offset.x),
          ),
        ).toBeLessThan(5);
        expect(
          Math.abs(
            placeOf(placement?.y ?? { scale: 0, offset: 0 }, y) -
              (scale * y + offset.y),
          ),
        ).toBeLessThan(5);
      }
    }
  });

  it('leaves everything where it is when nothing moved', () => {
    const edit = editWith(1, { x: 1, y: 0 });
    expect(findPlacement(original, edit, whole)).toBeNull();
  });

  it('finds nothing when the edit shows something else', () => {
    const edit = picture(size, (x, y) => scene(x + 5000, y + 9000));
    expect(findPlacement(original, edit, whole)).toBeNull();
  });
});
