import { Effect } from 'effect';
import type { Box } from './domain.ts';
import { ToolFailed } from './errors/errors.ts';
import { toolBytes, toolText } from './tools.ts';

export type Size = { readonly width: number; readonly height: number };

/** A picture's pixels: red, green and blue from 0 to 255, row by row. */
export type Raster = Size & { readonly pixels: Uint8Array };

/** A rectangle in pixels. */
export type Frame = Size & { readonly left: number; readonly top: number };

const sizePattern = /^(?<width>\d+) (?<height>\d+)$/u;

/** How large a picture is, in pixels. */
export const sizeOf = Effect.fn('sizeOf')(function* (file: string) {
  const text = yield* toolText('magick', [
    'identify',
    '-format',
    '%w %h',
    file,
  ]);
  const size = sizePattern.exec(text.trim())?.groups;
  if (size === undefined) {
    return yield* new ToolFailed({
      message: `ImageMagick could not tell how large ${file} is.`,
    });
  }
  return { width: Number(size.width), height: Number(size.height) };
});

/** A box in fractions as whole pixels inside a picture of the given size. */
export const frameOf = (box: Box, size: Size): Frame => {
  const left = Math.round(box.left * size.width);
  const top = Math.round(box.top * size.height);
  return {
    left,
    top,
    width: Math.max(1, Math.round(box.right * size.width) - left),
    height: Math.max(1, Math.round(box.bottom * size.height) - top),
  };
};

const geometry = ({ width, height, left, top }: Frame) =>
  `${width}x${height}+${left}+${top}`;

export type Rendering = {
  /** The part to show; all of it when absent. */
  readonly frame?: Frame;
  /** The longest side in pixels; larger pictures are made smaller. */
  readonly longSide?: number;
  /** JPEG quality, 1 to 100. */
  readonly quality?: number;
};

const viewingQuality = 88;

/**
 * A picture as a JPEG without any metadata, so what reaches a model is only
 * what it looks like. `source` is a file that is already the right way up.
 */
export const rendered = (source: string, rendering: Rendering = {}) =>
  toolBytes('magick', [
    source,
    ...(rendering.frame === undefined
      ? []
      : ['-crop', geometry(rendering.frame), '+repage']),
    ...(rendering.longSide === undefined
      ? []
      : ['-resize', `${rendering.longSide}x${rendering.longSide}>`]),
    '-strip',
    '-quality',
    String(rendering.quality ?? viewingQuality),
    'jpg:-',
  ]);

/** Writes part of a picture at exactly the given size. */
export const renderExactly = (
  source: string,
  target: string,
  options: {
    readonly frame: Frame;
    readonly size: Size;
    readonly quality: number;
  },
) =>
  toolBytes('magick', [
    source,
    '-crop',
    geometry(options.frame),
    '+repage',
    '-resize',
    `${options.size.width}x${options.size.height}!`,
    '-strip',
    '-quality',
    String(options.quality),
    target,
  ]);

const bitDepth = ['-depth', '8'];
const samplesPerPixel = 3;

/** The pixels of a picture, scaled to the given size. */
export const rasterOf = Effect.fn('rasterOf')(function* (
  file: string,
  { width, height }: Size,
) {
  const pixels = yield* toolBytes('magick', [
    file,
    '-resize',
    `${width}x${height}!`,
    '-alpha',
    'off',
    ...bitDepth,
    'rgb:-',
  ]);
  if (pixels.length !== width * height * samplesPerPixel) {
    return yield* new ToolFailed({
      message: `ImageMagick could not read all of ${file}.`,
    });
  }
  return { width, height, pixels } satisfies Raster;
});

/** Writes pixels as a picture. */
export const writeRaster = (target: string, raster: Raster) =>
  toolBytes(
    'magick',
    ['-size', `${raster.width}x${raster.height}`, ...bitDepth, 'rgb:-', target],
    { input: raster.pixels },
  );
