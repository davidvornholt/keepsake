import { describe, expect, it } from 'bun:test';
import { matteOf } from './matte.ts';
import type { Planes } from './raster.ts';

const size = { width: 80, height: 60 };

const plane = (value: (x: number, y: number) => number) =>
  Float32Array.from({ length: size.width * size.height }, (_, index) =>
    value(index % size.width, Math.floor(index / size.width)),
  );

const isPerson = (x: number) => x >= 25 && x < 55;
const at = (values: Float32Array, x: number) =>
  values[30 * size.width + x] ?? -1;

describe('matteOf', () => {
  it('follows the colours where the outline is off', () => {
    const colours: Planes = [
      plane((x) => (isPerson(x) ? 0.8 : 0.3)),
      plane((x) => (isPerson(x) ? 0.5 : 0.4)),
      plane((x) => (isPerson(x) ? 0.4 : 0.6)),
    ];
    // The outline is 4 pixels too wide on the left and too narrow on the right.
    const mask = plane((x) => (x >= 21 && x < 51 ? 1 : 0));
    const { matte } = matteOf(colours, mask, size);
    expect(at(matte, 22)).toBeLessThan(0.05);
    expect(at(matte, 27)).toBeGreaterThan(0.95);
    expect(at(matte, 52)).toBeGreaterThan(0.95);
    expect(at(matte, 57)).toBeLessThan(0.05);
  });

  it('knows a person of several colours', () => {
    const value = plane((x, y) => {
      const spot = (x + y) % 4 === 0 ? 0.9 : 0.6;
      return isPerson(x) ? spot : 0.2;
    });
    const mask = plane((x) => (x >= 21 && x < 59 ? 1 : 0));
    const { matte } = matteOf([value, value, value], mask, size);
    expect(at(matte, 22)).toBeLessThan(0.05);
    expect(at(matte, 27)).toBeGreaterThan(0.95);
  });

  it('follows the outline where the colours don’t tell', () => {
    const value = plane(() => 0.5);
    const mask = plane((x) => (isPerson(x) ? 1 : 0));
    const { matte } = matteOf([value, value, value], mask, size);
    expect(at(matte, 20)).toBeLessThan(0.3);
    expect(at(matte, 40)).toBe(1);
    expect(at(matte, 60)).toBeLessThan(0.3);
  });
});
