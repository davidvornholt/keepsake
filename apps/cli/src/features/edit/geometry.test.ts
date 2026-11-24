import { describe, expect, it } from 'bun:test';
import { aspectNames, ratioOf } from '../../shared/domain.ts';
import {
  closestAspect,
  exactFrame,
  fitAspect,
  outputSize,
  within,
} from './geometry.ts';

const camera = { width: 7008, height: 4672 };
const everything = { left: 0, top: 0, right: 1, bottom: 1 };

const pixels = (box: typeof everything) => ({
  width: Math.round((box.right - box.left) * camera.width),
  height: Math.round((box.bottom - box.top) * camera.height),
});

describe('fitAspect', () => {
  it.each(aspectNames)('keeps the whole box in a %s crop', (aspect) => {
    const box = { left: 0.4, top: 0.35, right: 0.6, bottom: 0.65 };
    const crop = fitAspect(box, camera, aspect);
    const { width, height } = pixels(crop);
    expect(width / height).toBeCloseTo(ratioOf(aspect), 2);
    expect(crop.left).toBeLessThanOrEqual(box.left + 1e-9);
    expect(crop.top).toBeLessThanOrEqual(box.top + 1e-9);
    expect(crop.right).toBeGreaterThanOrEqual(box.right - 1e-9);
    expect(crop.bottom).toBeGreaterThanOrEqual(box.bottom - 1e-9);
  });

  it('moves a crop inside the picture', () => {
    const crop = fitAspect(
      { left: 0.9, top: 0.9, right: 1, bottom: 1 },
      camera,
      '1:1',
    );
    expect(crop.right).toBeCloseTo(1);
    expect(crop.bottom).toBeCloseTo(1);
    expect(pixels(crop)).toEqual({ width: 1600, height: 1600 });
  });

  it('is never smaller than an edit needs', () => {
    const speck = { left: 0.5, top: 0.5, right: 0.51, bottom: 0.51 };
    expect(pixels(fitAspect(speck, camera, '3:2')).width).toBe(1600);
    expect(pixels(fitAspect(speck, camera, '2:3')).height).toBe(1600);
  });

  it('takes the largest crop of a shape when the box is too large for it', () => {
    expect(pixels(fitAspect(everything, camera, '1:1'))).toEqual({
      width: 4672,
      height: 4672,
    });
  });

  it('goes beyond the picture only where the box does', () => {
    const box = { left: -0.1, top: 0.2, right: 0.6, bottom: 0.8 };
    const crop = fitAspect(box, camera, '3:2');
    expect(crop.left).toBeCloseTo(-0.1);
    expect(crop.right).toBeCloseTo(0.6);
    const square = fitAspect(box, camera, '1:1');
    expect(square.top).toBeCloseTo(0);
    expect(square.bottom).toBeCloseTo(1);
    expect(square.left).toBeGreaterThanOrEqual(-0.1);
  });
});

describe('closestAspect', () => {
  it.each([
    [7008, 4672, '3:2'],
    [4672, 7008, '2:3'],
    [6000, 4000, '3:2'],
    [4032, 3024, '4:3'],
    [3024, 4032, '3:4'],
  ] as const)('calls %i by %i %s', (width, height, aspect) => {
    expect(closestAspect({ width, height })).toBe(aspect);
  });
});

describe('outputSize', () => {
  it.each(aspectNames)('is as large as the model takes for %s', (aspect) => {
    const { width, height } = outputSize(aspect);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
    expect(width * height).toBeLessThanOrEqual(8_294_400);
    expect(width * height).toBeGreaterThan(8_000_000);
    expect(Math.abs(width / height / ratioOf(aspect) - 1)).toBeLessThan(0.006);
  });
});

describe('exactFrame', () => {
  it('has the shape of the output and stays inside the crop', () => {
    const output = outputSize('3:2');
    const frame = exactFrame(everything, camera, output);
    expect(frame.width / frame.height).toBeCloseTo(
      output.width / output.height,
      3,
    );
    expect(frame.left + frame.width).toBeLessThanOrEqual(camera.width);
    expect(frame.top + frame.height).toBeLessThanOrEqual(camera.height);
    expect(frame.width).toBeGreaterThan(camera.width * 0.99);
  });

  it.each(aspectNames)('is never a pixel outside a %s crop', (aspect) => {
    const corner = { left: 0.71, top: 0.67, right: 1, bottom: 1 };
    const crop = fitAspect(corner, camera, aspect);
    const frame = exactFrame(crop, camera, outputSize(aspect));
    expect(frame.left + frame.width).toBeLessThanOrEqual(camera.width);
    expect(frame.top + frame.height).toBeLessThanOrEqual(camera.height);
  });
});

describe('within', () => {
  it('sees a box from inside a crop', () => {
    const crop = { left: 0.25, top: 0.5, right: 0.75, bottom: 1 };
    const box = { left: 0.5, top: 0.5, right: 1, bottom: 0.75 };
    expect(within(box, crop)).toEqual({
      left: 0.5,
      top: 0,
      right: 1,
      bottom: 0.5,
    });
  });
});
