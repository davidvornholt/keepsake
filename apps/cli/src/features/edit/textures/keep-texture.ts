import { clamp, wholePicture } from '../../../shared/boxes.ts';
import type { Box, Outline } from '../../../shared/domain.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { isInside } from '../people/outline.ts';
import { fading } from '../pixels/frames.ts';
import { type Fit, fitted, guidedFilter } from '../pixels/guided.ts';
import {
  brightest,
  brightnessOf,
  type Channel,
  channels,
  indexOf,
  mapPlanes,
  type Plane,
  type Planes,
  type Reader,
  readerAt,
  shrunkLight,
  srgbOf,
} from '../pixels/raster.ts';
import { averaging, multiplied } from '../pixels/smooth.ts';

/** Light is compared in a view of this size, which shows no leaves. */
const side = 480;
/** The neighbourhood that has the same light, in pixels of that view. */
const radius = 5;
const calm = 0.0005;
/** How soft the edge of an outline is, in pixels of that view. */
const edge = 1;
/** How far from where the photo ends its texture starts to fade, like `edge`. */
const seam = 48;
/** Where the colours are this far from the edit’s, something else is shown. */
const otherThing = { from: 0.04, to: 0.1 };
/** A photo this dark is mostly noise, which the light of an edit would show. */
const almostBlack = { from: 0.06, to: 0.1 };
/** The most that contrast is made stronger. */
const mostContrast = 2;
const hardlyAny = 1e-6;
const half = 0.5;

const viewSize = ({ width, height }: Size): Size => {
  const scale = Math.max(1, Math.max(width, height) / side);
  return {
    width: Math.max(1, Math.round(width / scale)),
    height: Math.max(1, Math.round(height / scale)),
  };
};

const smallValues = (raster: Raster, size: Size): Planes => {
  const frame: Frame = {
    left: 0,
    top: 0,
    width: raster.width,
    height: raster.height,
  };
  return mapPlanes(shrunkLight(raster, frame, size), (plane) =>
    plane.map(srgbOf),
  );
};

/** How much is the photo's own, from 0 where it ends inside the picture to 1. */
const ownAt = (
  { x, y }: { readonly x: number; readonly y: number },
  photo: Box,
  size: Size,
): number => {
  const distances = [
    photo.left > 0 ? (x - photo.left) * size.width : seam,
    photo.top > 0 ? (y - photo.top) * size.height : seam,
    photo.right < 1 ? (photo.right - x) * size.width : seam,
    photo.bottom < 1 ? (photo.bottom - y) * size.height : seam,
  ];
  return 1 - fading(Math.min(...distances), 0, seam);
};

const maskOf = (
  outlines: ReadonlyArray<Outline>,
  photo: Box,
  size: Size,
  average: (plane: Plane) => Plane,
): Plane =>
  average(
    Float32Array.from({ length: size.width * size.height }, (_, index) => {
      const point = {
        x: ((index % size.width) + half) / size.width,
        y: (Math.floor(index / size.width) + half) / size.height,
      };
      return outlines.some((outline) => isInside(outline, point))
        ? ownAt(point, photo, size)
        : 0;
    }),
  );

/** A fit for red, one for green and one for blue. */
type Fits = readonly [Fit, Fit, Fit];

/**
 * How the colours of an edit follow from those of a photo. Where the view is
 * flat, such as on asphalt, the photo's pixels keep the contrast they have.
 */
const fitsOf = (
  before: Planes,
  after: Planes,
  average: (plane: Plane) => Plane,
): Fits => {
  const follow = guidedFilter(before, average, calm);
  const fitFor = (channel: Channel): Fit => {
    const { slopes, offset } = follow(
      after[channel].map(
        (value, index) => value - (before[channel][index] ?? 0),
      ),
    );
    return {
      slopes: mapPlanes(slopes, (plane, from) =>
        from === channel ? plane.map((slope) => slope + 1) : plane,
      ),
      offset,
    };
  };
  return [fitFor(0), fitFor(1), fitFor(2)];
};

/** How close the light and the colours of two views are, from 0 to 1. */
const closeness = (left: Planes, right: Planes): Plane =>
  left[0].map((_, index) => {
    const squares = channels.map(
      (channel) =>
        ((left[channel][index] ?? 0) - (right[channel][index] ?? 0)) ** 2,
    );
    const far = Math.sqrt(
      squares.reduce((sum, square) => sum + square, 0) / squares.length,
    );
    return fading(far, otherThing.from, otherThing.to - otherThing.from);
  });

/** How much more than noise a photo shows, from 0 where it is almost black. */
const litness = (photo: Planes): Plane =>
  brightnessOf(photo).map(
    (value) =>
      1 - fading(value, almostBlack.from, almostBlack.to - almostBlack.from),
  );

/** How many times stronger the contrast of an edit is, if it is stronger. */
const contrastOf = (
  reached: Planes,
  after: Planes,
  average: (plane: Plane) => Plane,
): Plane => {
  const varianceOf = (planes: Planes) => {
    const plane = brightnessOf(planes);
    const mean = average(plane);
    return average(multiplied(plane, plane)).map(
      (square, index) => square - (mean[index] ?? 0) ** 2,
    );
  };
  const wanted = varianceOf(after);
  return average(
    varianceOf(reached).map((variance, index) =>
      clamp(
        Math.sqrt(
          Math.max(wanted[index] ?? 0, 0) / Math.max(variance, hardlyAny),
        ),
        1,
        mostContrast,
      ),
    ),
  );
};

/** The photo's own pixels in the light of an edit, as a small view has it. */
type Texture = {
  readonly fits: Fits;
  readonly contrast: Plane;
  readonly middle: Planes;
};

/** The values of a pixel of the photo in the light of an edit. */
const litBy = (
  { fits, contrast, middle }: Texture,
  read: Reader,
  pixel: (channel: Channel) => number,
): ReadonlyArray<number> => {
  const stronger = read(contrast);
  return channels.map((channel) => {
    const { slopes, offset } = fits[channel];
    const usual = read(middle[channel]);
    const own = channels.reduce(
      (value, from) => value + read(slopes[from]) * pixel(from),
      read(offset),
    );
    return clamp(usual + stronger * (own - usual), 0, 1);
  });
};

/**
 * Gives an edit the photo's own texture within outlines, such as the leaves of
 * a forest, with the light, the contrast and the colours the edit has there.
 * Where it shows something else or the photo is almost black, it stays as it is.
 * `photo` is where the photo is in a picture that goes on beyond it. Changes
 * `edit`.
 */
export const keepTexture = (
  original: Raster,
  edit: Raster,
  outlines: ReadonlyArray<Outline>,
  photo: Box = wholePicture,
): void => {
  if (outlines.length === 0) {
    return;
  }
  const size = viewSize(original);
  const everywhere = new Float32Array(size.width * size.height).fill(1);
  const soften = averaging(everywhere, size, edge);
  const average = averaging(everywhere, size, radius);
  const before = smallValues(original, size);
  const after = smallValues(edit, size);
  const fits = fitsOf(before, after, average);
  const reached = mapPlanes(before, (_, channel) =>
    fitted(fits[channel], before),
  );
  const texture = {
    fits,
    contrast: contrastOf(reached, after, average),
    middle: mapPlanes(reached, average),
  };
  const trusted = multiplied(
    closeness(reached, after),
    litness(mapPlanes(before, average)),
  );
  const mask = soften(
    multiplied(maskOf(outlines, photo, size, soften), trusted),
  );
  for (let y = 0; y < original.height; y += 1) {
    for (let x = 0; x < original.width; x += 1) {
      const read = readerAt(original, size, { x, y });
      const part = read(mask);
      if (part > 0) {
        const index = indexOf(original, x, y);
        const values = litBy(
          texture,
          read,
          (channel) => (original.pixels[index + channel] ?? 0) / brightest,
        );
        for (const [channel, value] of values.entries()) {
          edit.pixels[index + channel] = Math.round(
            part * value * brightest +
              (1 - part) * (edit.pixels[index + channel] ?? 0),
          );
        }
      }
    }
  }
};
