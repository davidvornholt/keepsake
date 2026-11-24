import { describe, expect, it } from 'bun:test';
import type { Raster } from '../../../shared/pictures.ts';
import { lightAt, lightOf, srgbOf } from '../pixels/raster.ts';
import { keepPerson } from './relight.ts';

const size = { width: 200, height: 160 };
type Colour = readonly [number, number, number];

const picture = (colour: (x: number, y: number) => Colour): Raster => {
  const pixels = new Uint8Array(size.width * size.height * 3);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      pixels.set(colour(x, y), (y * size.width + x) * 3);
    }
  }
  return { ...size, pixels };
};

const copy = (raster: Raster): Raster => ({
  ...raster,
  pixels: raster.pixels.slice(),
});

const at = (raster: Raster, x: number, y: number): Colour => {
  const index = (y * size.width + x) * 3;
  const [red = 0, green = 0, blue = 0] = raster.pixels.slice(index, index + 3);
  return [red, green, blue];
};

/** The mean light of a few columns. */
const meanLight = (raster: Raster, left: number, right: number): number => {
  let sum = 0;
  let count = 0;
  for (let y = 60; y < 100; y += 1) {
    for (let x = left; x < right; x += 1) {
      sum += lightAt(at(raster, x, y)[1]);
      count += 1;
    }
  }
  return sum / count;
};

// The person is 70 pixels wide, with a face of 40, so one pixel of the picture
// is one of the small view. The outline is 4 pixels too wide.
const isPerson = (x: number) => x >= 60 && x < 130;
const person = {
  face: { left: 0.4, top: 0.25, right: 0.6, bottom: 0.6 },
  outline: [
    { x: 56 / size.width, y: 0 },
    { x: 134 / size.width, y: 0 },
    { x: 134 / size.width, y: 1 },
    { x: 56 / size.width, y: 1 },
  ],
};

const wall: Colour = [150, 190, 225];
const brighterWall: Colour = [170, 205, 235];
/** Stripes stand for features; an edit may move them. */
const skin = (x: number, shift: number, gain: number): Colour => {
  const value = (x + shift) % 4 < 2 ? 70 : 95;
  const lifted = (part: number) =>
    Math.round(srgbOf(lightOf((value * part) / 255) * gain) * 255);
  return [lifted(1.3), lifted(1), lifted(0.8)];
};

const original = picture((x) => (isPerson(x) ? skin(x, 0, 1) : wall));

describe('keepPerson', () => {
  it('keeps the features and takes over the light', () => {
    const edit = picture((x) => (isPerson(x) ? skin(x, 2, 2) : brighterWall));
    keepPerson(original, edit, person);
    // Stripes are where the original has them, not where the edit had.
    expect(at(edit, 92, 80)[1]).toBeLessThan(at(edit, 94, 80)[1] - 20);
    const gain = meanLight(edit, 80, 112) / meanLight(original, 80, 112);
    expect(gain).toBeGreaterThan(1.8);
    expect(gain).toBeLessThanOrEqual(2);
  });

  it('leaves the surroundings to the edit, up to the person’s edge', () => {
    const edit = picture((x) => (isPerson(x) ? skin(x, 2, 2) : brighterWall));
    keepPerson(original, edit, person);
    for (const x of [10, 50, 54, 57, 133, 137, 150]) {
      const [red, green, blue] = at(edit, x, 80);
      expect(Math.abs(red - brighterWall[0])).toBeLessThan(8);
      expect(Math.abs(green - brighterWall[1])).toBeLessThan(8);
      expect(Math.abs(blue - brighterWall[2])).toBeLessThan(8);
    }
  });

  it('leaves no second edge where the edit made a person wider', () => {
    const edit = picture((x) =>
      x >= 60 && x < 134 ? skin(x, 2, 2) : brighterWall,
    );
    keepPerson(original, edit, person);
    const isWall = (x: number) => {
      const [red, , blue] = at(edit, x, 80);
      return blue > red + 40;
    };
    for (let x = 120; x < 133; x += 1) {
      expect(isWall(x)).toBe(false);
    }
    for (let x = 136; x < 150; x += 1) {
      expect(isWall(x)).toBe(true);
    }
  });

  it('keeps a person the edit made slimmer', () => {
    const edit = picture((x) =>
      x >= 75 && x < 115 ? skin(x, 2, 2) : brighterWall,
    );
    keepPerson(original, edit, person);
    for (const x of [66, 70, 120, 124]) {
      const [red, , blue] = at(edit, x, 80);
      expect(red).toBeGreaterThan(blue);
    }
  });

  it('changes nothing when the edit changed nothing', () => {
    const edit = copy(original);
    keepPerson(original, edit, person);
    const most = original.pixels.reduce(
      (worst, value, index) =>
        Math.max(worst, Math.abs(value - (edit.pixels[index] ?? 0))),
      0,
    );
    expect(most).toBeLessThanOrEqual(1);
  });

  it('keeps detail in highlights that were lifted', () => {
    const bright = picture((x) => {
      const value = x % 4 < 2 ? 200 : 220;
      return isPerson(x) ? [value, value, value] : [60, 70, 80];
    });
    const edit = picture((x) => (isPerson(x) ? [252, 252, 252] : [60, 70, 80]));
    keepPerson(bright, edit, person);
    const [dark] = at(edit, 92, 80);
    const [light] = at(edit, 94, 80);
    expect(dark).toBeGreaterThan(200);
    expect(light).toBeGreaterThan(dark + 2);
    expect(light).toBeLessThan(255);
  });

  it('works on a person at the border of a picture', () => {
    const edit = copy(original);
    keepPerson(original, edit, {
      face: { left: 0.9, top: 0, right: 1, bottom: 0.2 },
      outline: [
        { x: 0.85, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(edit.pixels).toHaveLength(original.pixels.length);
  });
});
