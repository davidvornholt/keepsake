import { describe, expect, it } from 'bun:test';
import { aspectNames, ratioOf } from '../../shared/domain.ts';
import {
  editableSize,
  exactFrame,
  fitAspect,
  modelFrame,
  outOf,
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

describe('fitAspect with what is to be kept', () => {
  const portrait = { width: 2336, height: 3504 };

  it('loses what reaches beyond rather than what is kept', () => {
    const wanted = { left: -0.04, top: -0.06, right: 1, bottom: 1 };
    const kept = { left: 0, top: 0.012, right: 0.9, bottom: 1 };
    const crop = fitAspect(wanted, portrait, '2:3', kept);
    expect(crop.top).toBeCloseTo(-0.04);
    expect(crop.bottom).toBeCloseTo(1);
  });

  it('loses room around what is kept rather than what is kept', () => {
    const wanted = { left: 0, top: -0.07, right: 0.913, bottom: 1 };
    const kept = { left: 0, top: 0.012, right: 0.893, bottom: 1 };
    const crop = fitAspect(wanted, portrait, '9:16', kept);
    expect(crop.left).toBeCloseTo(0);
    expect(crop.right).toBeGreaterThanOrEqual(0.893);
  });

  it('keeps what fits exactly, despite rounding', () => {
    const photo = { width: 5000, height: 3000 };
    const wanted = { left: 0, top: 0, right: 0.85, bottom: 1 };
    const kept = { left: 0.2, top: 0.3, right: 0.8, bottom: 0.7 };
    const crop = fitAspect(wanted, photo, '1:1', kept);
    expect(crop.left * photo.width).toBeCloseTo(1000);
    expect(crop.right * photo.width).toBeCloseTo(4000);
  });

  it('is centred on the box when what is kept doesn’t fit', () => {
    const square = { width: 4000, height: 4000 };
    const wanted = { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 };
    const kept = { left: 0, top: 0.3, right: 0.8, bottom: 0.65 };
    const crop = fitAspect(wanted, square, '1:1', kept);
    expect(crop.left).toBeCloseTo(0.1);
    expect(crop.top).toBeCloseTo(0.1);
  });

  it('is centred on the box when the shape is too small for it', () => {
    const crop = fitAspect(everything, camera, '1:1');
    expect(crop.left).toBeCloseTo(1 / 6);
    expect(crop.right).toBeCloseTo(5 / 6);
  });
});

describe('outputSize', () => {
  it.each(aspectNames)('is as large as the model takes for %s', (aspect) => {
    const { width, height } = outputSize(
      fitAspect(everything, camera, aspect),
      camera,
    );
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
    expect(width * height).toBeLessThanOrEqual(8_294_400);
    expect(width * height).toBeGreaterThan(8_000_000);
    expect(Math.abs(width / height / ratioOf(aspect) - 1)).toBeLessThan(0.006);
  });

  it.each([
    [
      { width: 6000, height: 2000 },
      { width: 3840, height: 1280 },
    ],
    [
      { width: 12_000, height: 2000 },
      { width: 3840, height: 640 },
    ],
    [
      { width: 2000, height: 12_000 },
      { width: 640, height: 3840 },
    ],
    [
      { width: 12_345, height: 2000 },
      { width: 3840, height: 624 },
    ],
    [
      { width: 10_000, height: 31 },
      { width: 3840, height: 12 },
    ],
    [
      { width: 31, height: 10_000 },
      { width: 12, height: 3840 },
    ],
  ])('keeps all of a panorama of %o in its shape', (panorama, size) => {
    expect(outputSize(everything, panorama)).toEqual(size);
  });
});

describe('modelFrame', () => {
  it.each([
    { width: 3840, height: 2560 },
    { width: 3840, height: 1280 },
    { width: 1280, height: 3840 },
  ])('is a picture of %o that the model makes itself', (size) => {
    expect(modelFrame(size)).toEqual({ left: 0, top: 0, ...size });
  });

  it.each([
    [
      { width: 3840, height: 640 },
      { left: 0, top: -320, width: 3840, height: 1280 },
    ],
    [
      { width: 640, height: 3840 },
      { left: -320, top: 0, width: 1280, height: 3840 },
    ],
    [
      { width: 3840, height: 528 },
      { left: 0, top: -376, width: 3840, height: 1280 },
    ],
    [
      { width: 3840, height: 12 },
      { left: 0, top: -634, width: 3840, height: 1280 },
    ],
    [
      { width: 3840, height: 1288 },
      { left: 0, top: -4, width: 3840, height: 1296 },
    ],
    [
      { width: 1288, height: 3840 },
      { left: -4, top: 0, width: 1296, height: 3840 },
    ],
  ])('adds as much grey to %o as the model needs', (size, frame) => {
    expect(modelFrame(size)).toEqual(frame);
  });

  it('makes a frame the model takes of any panorama', () => {
    for (let height = 1; height <= 1280; height += 1) {
      const { width, height: frameHeight } = modelFrame({
        width: 3840,
        height,
      });
      expect(frameHeight % 16).toBe(0);
      expect(width / frameHeight).toBeLessThanOrEqual(3);
      expect(frameHeight - height).toBeLessThan(1280);
    }
  });
});

describe('editableSize', () => {
  it.each([
    [
      { width: 10_000, height: 31 },
      { width: 3840, height: 12 },
    ],
    [
      { width: 31, height: 10_000 },
      { width: 12, height: 3840 },
    ],
  ])('keeps the shape of a long panorama of %o', (panorama, size) => {
    expect(editableSize(panorama)).toEqual(size);
  });

  it('is a picture’s own if the model makes it', () => {
    const own = { width: 3520, height: 2352 };
    expect(editableSize(own)).toEqual(own);
  });

  it.each([
    { width: 2520, height: 1680 },
    { width: 2523, height: 1677 },
    { width: 7008, height: 4672 },
  ])('has the shape of any other picture: %o', (size) => {
    const { width, height } = editableSize(size);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(width * height).toBeGreaterThan(8_000_000);
    expect(
      Math.abs(((width / height) * size.height) / size.width - 1),
    ).toBeLessThan(0.006);
  });
});

describe('exactFrame', () => {
  it('has the shape of the output and stays inside the crop', () => {
    const almost = { left: 0, top: 0, right: 1, bottom: 0.999 };
    const output = outputSize(almost, camera);
    const frame = exactFrame(almost, camera, output);
    expect(frame.width / frame.height).toBeCloseTo(
      output.width / output.height,
      3,
    );
    expect(frame.left + frame.width).toBeLessThanOrEqual(camera.width);
    expect(frame.top + frame.height).toBeLessThanOrEqual(camera.height);
    expect(frame.width).toBeGreaterThan(camera.width * 0.99);
  });

  it('takes every pixel of the whole photo', () => {
    const panorama = { width: 12_345, height: 2048 };
    expect(
      exactFrame(everything, panorama, outputSize(everything, panorama)),
    ).toEqual({ left: 0, top: 0, ...panorama });
  });

  it.each(aspectNames)('is never a pixel outside a %s crop', (aspect) => {
    const corner = { left: 0.71, top: 0.67, right: 1, bottom: 1 };
    const crop = fitAspect(corner, camera, aspect);
    const frame = exactFrame(crop, camera, outputSize(crop, camera));
    expect(frame.left + frame.width).toBeLessThanOrEqual(camera.width);
    expect(frame.top + frame.height).toBeLessThanOrEqual(camera.height);
  });
});

describe('outOf', () => {
  it('sees a box from inside a crop in the whole picture again', () => {
    const crop = { left: 0.25, top: 0.5, right: 0.75, bottom: 1 };
    const box = { left: -0.5, top: 0, right: 1, bottom: 1.5 };
    expect(outOf(box, crop)).toEqual({
      left: 0,
      top: 0.5,
      right: 0.75,
      bottom: 1.25,
    });
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
