import { describe, expect, it } from 'bun:test';
import {
  brightest,
  lightAt,
  lightOf,
  readerAt,
  shrunkLight,
  srgbOf,
} from './raster.ts';

describe('light', () => {
  it('turns into sRGB values and back', () => {
    for (let value = 0; value <= brightest; value += 1) {
      expect(srgbOf(lightOf(value / brightest)) * brightest).toBeCloseTo(value);
    }
  });

  it('is a fifth for a middle grey', () => {
    expect(lightAt(124)).toBeCloseTo(0.2, 2);
  });
});

describe('shrunkLight', () => {
  it('averages light rather than values', () => {
    const pixels = new Uint8Array(4 * 2 * 3);
    // The left half of the frame is white, the right half is black.
    for (const pixel of [0, 1, 4, 5]) {
      pixels.fill(255, pixel * 3, pixel * 3 + 3);
    }
    const raster = { width: 4, height: 2, pixels };
    const frame = { left: 0, top: 0, width: 4, height: 2 };
    const [red] = shrunkLight(raster, frame, { width: 1, height: 1 });
    expect(red[0]).toBeCloseTo(0.5);
    const [, green] = shrunkLight(raster, frame, { width: 2, height: 1 });
    expect([...green]).toEqual([1, 0]);
  });

  it('looks only at the frame', () => {
    const pixels = new Uint8Array(3 * 3).fill(255);
    pixels.fill(0, 3, 6);
    const raster = { width: 3, height: 1, pixels };
    const frame = { left: 1, top: 0, width: 1, height: 1 };
    const [, , blue] = shrunkLight(raster, frame, { width: 1, height: 1 });
    expect(blue[0]).toBe(0);
  });
});

describe('readerAt', () => {
  const plane = Float32Array.from([0, 1]);
  const small = { width: 2, height: 1 };
  const large = { width: 8, height: 4 };
  const values = [0, 1, 2, 3, 4, 5, 6, 7].map((x) =>
    readerAt(large, small, { x, y: 2 })(plane),
  );

  it('blends neighbours and repeats the ones at the border', () => {
    expect(values).toEqual([0, 0, 0.125, 0.375, 0.625, 0.875, 1, 1]);
  });

  it('reads a plane with a single pixel', () => {
    const read = readerAt(large, { width: 1, height: 1 }, { x: 7, y: 3 });
    expect(read(Float32Array.from([0.3]))).toBeCloseTo(0.3);
  });
});
