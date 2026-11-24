import { describe, expect, it } from 'bun:test';
import { brightest, type Planes, valuesIn } from './raster.ts';
import { isBlock, picture } from './test-pictures.ts';
import { inLightOf, toneOf, tonesOf } from './tones.ts';

const ramp = Float32Array.from({ length: 1001 }, (_, step) => step / 1000);

describe('tonesOf', () => {
  it('finds how a change of light changed each brightness', () => {
    const tones = tonesOf(
      ramp,
      ramp.map((value) => value ** 0.5),
    );
    expect(toneOf(tones, 0.25)).toBeCloseTo(0.5, 1);
    expect(toneOf(tones, 0.64)).toBeCloseTo(0.8, 1);
    expect(toneOf(tones, 0)).toBe(0);
    expect(toneOf(tones, 1)).toBe(1);
  });

  it('never makes what is brighter darker', () => {
    const tones = tonesOf(
      ramp,
      ramp.map((value) => 1 - value),
    );
    const after = tones.map((tone) => tone.after);
    expect(after).toEqual(after.toSorted((left, right) => left - right));
  });
});

const size = { width: 60, height: 60 };
const frame = { left: 0, top: 0, ...size };
const grey = (dark: number, bright: number) =>
  valuesIn(
    picture(size, (x, y) => (isBlock(x, y) ? bright : dark)),
    frame,
  );
const counted = new Float32Array(size.width * size.height).fill(1);

describe('inLightOf', () => {
  it('gives a picture the light of its edit', () => {
    const before = grey(40, 90);
    const { values } = inLightOf(before, grey(80, 200), counted, size);
    const dark = before[0].findIndex((value) => value < 0.25);
    const bright = before[0].findIndex((value) => value > 0.25);
    expect((values[0][dark] ?? 0) * brightest).toBeCloseTo(80, -1);
    expect((values[0][bright] ?? 0) * brightest).toBeCloseTo(200, -1);
  });

  it('makes colours as vivid as they are in the edit, within limits', () => {
    const flat = new Float32Array(counted.length).fill(0.5);
    const warm = (more: number): Planes => [
      flat.map((value) => value + more),
      flat,
      flat.map((value) => value - more),
    ];
    const reddest = (after: Planes) =>
      (inLightOf(warm(0.1), after, counted, size).values[0][0] ?? 0) - 0.5;
    expect(reddest(warm(0.12))).toBeGreaterThan(reddest(warm(0.1)));
    expect(reddest(warm(0.4))).toBeLessThan(0.25);
  });
});
