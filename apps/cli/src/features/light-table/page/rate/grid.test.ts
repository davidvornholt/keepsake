import { describe, expect, it } from 'bun:test';
import { stepIn, tilesFor } from './grid.ts';

const landscape = 1.5;
const upright = 2 / 3;

describe('tilesFor', () => {
  const space = { width: 1200, height: 700 };
  const room = { gap: 10, strip: 40 };

  it('keeps every photo and its strip inside the space, in its own shape', () => {
    const shapes = [landscape, landscape, upright, landscape, landscape];
    const { photos, below } = tilesFor(shapes, space, room);
    for (const [at, rect] of photos.entries()) {
      expect(rect.w / rect.h).toBeCloseTo(shapes[at] ?? 0);
      expect(rect.x).toBeGreaterThanOrEqual(-0.001);
      expect(rect.x + rect.w).toBeLessThanOrEqual(space.width + 0.001);
      expect(rect.y).toBeGreaterThanOrEqual(-0.001);
      expect((below[at]?.y ?? 0) + room.strip).toBeLessThanOrEqual(
        space.height + 0.001,
      );
    }
  });

  it('stacks two landscape photos on a tall page', () => {
    const tall = { width: 400, height: 900 };
    expect(tilesFor([landscape, landscape], tall, room).columns).toBe(1);
  });

  it('leaves the gap between two photos', () => {
    const { photos, columns } = tilesFor([landscape, landscape], space, room);
    const [first, second] = photos;
    expect(columns).toBe(2);
    expect((second?.x ?? 0) - ((first?.x ?? 0) + (first?.w ?? 0))).toBeCloseTo(
      room.gap,
    );
  });

  it('puts a last row that isn’t full in the middle', () => {
    const { photos, columns } = tilesFor(
      [landscape, landscape, landscape],
      { width: 1000, height: 1000 },
      room,
    );
    expect(columns).toBe(2);
    const [, , last] = photos;
    expect((last?.x ?? 0) + (last?.w ?? 0) / 2).toBeCloseTo(500);
  });

  it('lays out nothing at all', () => {
    expect(tilesFor([], space, room).photos).toEqual([]);
  });
});

describe('stepIn', () => {
  it('starts at the first photo and stays inside', () => {
    const right = { right: 1, down: 0 };
    const down = { right: 0, down: 1 };
    expect(stepIn(5, 3, null, right)).toBe(0);
    expect(stepIn(5, 3, 0, right)).toBe(1);
    expect(stepIn(5, 3, 1, down)).toBe(4);
    expect(stepIn(5, 3, 2, down)).toBe(2);
    expect(stepIn(5, 3, 0, { right: -1, down: 0 })).toBe(0);
  });
});
