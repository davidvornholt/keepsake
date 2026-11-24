import type { Raster, Size } from '../../../shared/pictures.ts';

const samples = 3;

/** A grey picture from how bright each pixel is. */
export const picture = (
  size: Size,
  grey: (x: number, y: number) => number,
): Raster => {
  const pixels = new Uint8Array(size.width * size.height * samples);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      pixels.fill(
        grey(x, y),
        (y * size.width + x) * samples,
        (y * size.width + x + 1) * samples,
      );
    }
  }
  return { ...size, pixels };
};

export const valueAt = (raster: Raster, x: number, y: number): number =>
  raster.pixels[(y * raster.width + x) * samples] ?? 0;

const cell = 5;
const half = 0.5;
// The usual numbers for a sine that looks random.
const perColumn = 12.9898;
const perRow = 78.233;
const spread = 43_758.5453;

/** Blocks that look random but are always the same. */
export const isBlock = (x: number, y: number): boolean => {
  const wave =
    Math.sin(Math.floor(x / cell) * perColumn + Math.floor(y / cell) * perRow) *
    spread;
  return wave - Math.floor(wave) > half;
};
