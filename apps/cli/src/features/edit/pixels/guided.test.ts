import { describe, expect, it } from 'bun:test';
import { fitted, guidedFilter } from './guided.ts';
import type { Planes } from './raster.ts';
import { averaging } from './smooth.ts';

const size = { width: 20, height: 20 };
const pixels = size.width * size.height;
const ones = new Float32Array(pixels).fill(1);

const plane = (value: (x: number, y: number) => number) =>
  Float32Array.from({ length: pixels }, (_, index) =>
    value(index % size.width, Math.floor(index / size.width)),
  );

/** Dark on the left, bright on the right. */
const step = plane((x) => (x < 10 ? 0.2 : 0.8));
const grey: Planes = [step, step, step];

describe('averaging', () => {
  it('keeps what is the same everywhere', () => {
    const same = plane(() => 0.4);
    for (const value of averaging(ones, size, 3)(same)) {
      expect(value).toBeCloseTo(0.4);
    }
  });

  it('counts pixels by their weight', () => {
    const left = plane((x) => (x < 10 ? 1 : 0));
    const average = averaging(left, size, 2)(step);
    // Pixel 11 sees both sides, but only the left one counts.
    expect(average[11]).toBeCloseTo(0.2);
    // Nothing that counts is close to the right border.
    expect(average[19]).toBe(0);
  });
});

describe('guidedFilter', () => {
  const average = averaging(ones, size, 3);

  it('finds what follows from the colours', () => {
    const red = plane((x) => x / 20);
    const green = plane((_, y) => y / 20);
    const blue = plane((x, y) => ((x * y) % 7) / 7);
    const guide: Planes = [red, green, blue];
    const target = red.map(
      (value, index) =>
        0.5 * value - 0.25 * (green[index] ?? 0) + 2 * (blue[index] ?? 0) + 1,
    );
    const found = fitted(guidedFilter(guide, average, 1e-9)(target), guide);
    for (const [index, value] of found.entries()) {
      expect(value).toBeCloseTo(target[index] ?? 0, 2);
    }
  });

  it('keeps the guide’s edges and loses the target’s own detail', () => {
    const target = plane((x, y) => (x < 10 ? 0 : 1) + ((x + y) % 2) * 0.4);
    const found = fitted(guidedFilter(grey, average, 1e-4)(target), grey);
    const row = 10 * size.width;
    expect(found[row + 9]).toBeCloseTo(0.2, 1);
    expect(found[row + 10]).toBeCloseTo(1.2, 1);
    expect(
      Math.abs((found[row + 4] ?? 0) - (found[row + 5] ?? 0)),
    ).toBeLessThan(0.02);
  });
});
