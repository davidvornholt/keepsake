import type { Frame, Raster, Size } from '../../../shared/pictures.ts';

export const channels = [0, 1, 2] as const;
export type Channel = (typeof channels)[number];
const channelCount = channels.length;

/** One value for each pixel, row by row. */
export type Plane = Float32Array;

/** A picture as a plane of red, one of green and one of blue. */
export type Planes = readonly [Plane, Plane, Plane];

export const mapPlanes = (
  planes: Planes,
  change: (plane: Plane, channel: Channel) => Plane,
): Planes => [change(planes[0], 0), change(planes[1], 1), change(planes[2], 2)];

export const brightest = 255;

const toeEnd = 0.040_45;
const toeSlope = 12.92;
const toeOffset = 0.055;
const gamma = 2.4;
const linearToeEnd = 0.003_130_8;

/** An sRGB value as the amount of light, both from 0 to 1. */
export const lightOf = (value: number): number =>
  value <= toeEnd
    ? value / toeSlope
    : ((value + toeOffset) / (1 + toeOffset)) ** gamma;

/** An amount of light as an sRGB value, both from 0 to 1. */
export const srgbOf = (light: number): number =>
  light <= linearToeEnd
    ? light * toeSlope
    : (1 + toeOffset) * light ** (1 / gamma) - toeOffset;

const lights = Float32Array.from({ length: brightest + 1 }, (_, value) =>
  lightOf(value / brightest),
);

/** The light of a value from 0 to 255. */
export const lightAt = (value: number): number => lights[value] ?? 0;

/** Where a channel of a pixel is in a raster's pixels. */
export const indexOf = (raster: Raster, x: number, y: number): number =>
  (y * raster.width + x) * channelCount;

/** The light in a part of a raster, made smaller by averaging. */
export const shrunkLight = (
  raster: Raster,
  frame: Frame,
  size: Size,
): Planes => {
  const planes: Planes = [
    new Float32Array(size.width * size.height),
    new Float32Array(size.width * size.height),
    new Float32Array(size.width * size.height),
  ];
  const counts = new Float32Array(size.width * size.height);
  for (let y = 0; y < frame.height; y += 1) {
    const row = Math.floor((y * size.height) / frame.height) * size.width;
    for (let x = 0; x < frame.width; x += 1) {
      const target = row + Math.floor((x * size.width) / frame.width);
      const source = indexOf(raster, frame.left + x, frame.top + y);
      counts[target] = (counts[target] ?? 0) + 1;
      for (const channel of channels) {
        const plane = planes[channel];
        plane[target] =
          (plane[target] ?? 0) + lightAt(raster.pixels[source + channel] ?? 0);
      }
    }
  }
  for (const plane of planes) {
    for (let index = 0; index < plane.length; index += 1) {
      plane[index] = (plane[index] ?? 0) / Math.max(1, counts[index] ?? 0);
    }
  }
  return planes;
};

/** The middle of a pixel. */
const center = 0.5;

/** Reads small planes at the pixels of a larger frame, blending neighbours. */
export type Reader = (plane: Plane) => number;

/**
 * For a pixel of a frame, a reader of planes that show the same frame in a
 * smaller size.
 */
export const readerAt = (
  frame: Size,
  size: Size,
  { x, y }: { readonly x: number; readonly y: number },
): Reader => {
  const along = (position: number, large: number, small: number) => {
    const exact = ((position + center) * small) / large - center;
    const inside = Math.min(Math.max(exact, 0), small - 1);
    const low = Math.min(Math.floor(inside), Math.max(small - 2, 0));
    return { low, high: Math.min(low + 1, small - 1), part: inside - low };
  };
  const column = along(x, frame.width, size.width);
  const row = along(y, frame.height, size.height);
  const above = row.low * size.width;
  const below = row.high * size.width;
  return (plane) => {
    const top =
      (plane[above + column.low] ?? 0) * (1 - column.part) +
      (plane[above + column.high] ?? 0) * column.part;
    const bottom =
      (plane[below + column.low] ?? 0) * (1 - column.part) +
      (plane[below + column.high] ?? 0) * column.part;
    return top * (1 - row.part) + bottom * row.part;
  };
};
