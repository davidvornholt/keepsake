import type { Box } from '../../../shared/domain.ts';
import type { Raster } from '../../../shared/pictures.ts';
import { grown } from '../people/outline.ts';
import type { Room } from '../pixels/frames.ts';
import { channels, type Plane } from '../pixels/raster.ts';
import { withoutSpecks } from '../pixels/regions.ts';
import { averaging } from '../pixels/smooth.ts';
import { blend, patchOf, softly } from './keep-patch.ts';

/** What is taken of a place: what clearly changed there, or all of it. */
export const takings = ['changed', 'all'] as const;
export type Taking = (typeof takings)[number];

// In pixels of a picture whose longer side has this many.
const side = 3600;
/** What differs over a shorter distance is texture that was redrawn. */
const calmRadius = 4;
/** How far what changed reaches beyond where it clearly differs. */
const grow = 9;
const edge = 5;

/** How far around a place something may have changed. */
const reach: Room = { pixels: 16, height: 0.04 };

/** Pixels where nothing changed differ less than this, except for a few, */
const usually = 0.98;
/** and what changed differs more than that. */
const more = 1.4;
const threshold = { least: 0.035, most: 0.12 };
/** Anything smaller than this share of what changed is texture as well. */
const speck = 0.03;

type Patch = NonNullable<ReturnType<typeof patchOf>>;

/** How differently a patch shows each pixel, apart from redrawn texture. */
const differenceOf = (
  { kept, after, place: { frame } }: Patch,
  radius: number,
): Plane => {
  const calm = averaging(
    new Float32Array(frame.width * frame.height).fill(1),
    frame,
    radius,
  );
  const sum = new Float32Array(frame.width * frame.height);
  for (const channel of channels) {
    const difference = calm(
      kept[channel].map((value, index) => value - (after[channel][index] ?? 0)),
    );
    for (const [index, value] of difference.entries()) {
      sum[index] = (sum[index] ?? 0) + value ** 2 / channels.length;
    }
  }
  return sum.map(Math.sqrt);
};

/** The difference that almost no pixel exceeds where nothing changed. */
const usualIn = (difference: Plane, free: Plane): number => {
  const sorted = difference.filter((_, index) => (free[index] ?? 0) > 0).sort();
  return sorted[Math.floor(usually * (sorted.length - 1))] ?? 0;
};

/** How much of each pixel clearly changed, with a soft edge. */
const changedPart = (patch: Patch, scale: number): Plane => {
  const { frame } = patch.place;
  const pixels = (length: number) => Math.max(1, Math.round(length * scale));
  const difference = differenceOf(patch, pixels(calmRadius));
  const least = Math.min(
    Math.max(more * usualIn(difference, patch.free), threshold.least),
    threshold.most,
  );
  const clearly = difference.map((value) => (value > least ? value : 0));
  return grown(
    withoutSpecks(clearly, frame, speck).map((value) => (value > 0 ? 1 : 0)),
    frame,
    { grow: pixels(grow), edge: pixels(edge) },
  );
};

/**
 * Takes a place of a version into the picture it was made of, in the light of
 * that picture. `places` are all that may be taken. Changes `picture`.
 */
export const takePlace = (
  version: Raster,
  picture: Raster,
  place: Box,
  {
    places,
    taking,
  }: { readonly places: ReadonlyArray<Box>; readonly taking: Taking },
): void => {
  const patch = patchOf(version, picture, {
    box: place,
    boxes: places,
    reach,
    isContinued: true,
  });
  if (patch === null) {
    return;
  }
  const { frame } = patch.place;
  const inside = softly(patch.place);
  if (taking === 'all') {
    blend(patch, picture, inside);
    return;
  }
  const scale = Math.max(picture.width, picture.height) / side;
  const changed = changedPart(patch, scale);
  blend(
    patch,
    picture,
    (column, row) =>
      inside(column, row) *
      (changed[(row - frame.top) * frame.width + column - frame.left] ?? 0),
  );
};
