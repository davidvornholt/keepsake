import { Effect } from 'effect';
import type { Box } from '../../../shared/domain.ts';
import {
  type Raster,
  rasterOf,
  sizeOf,
  writeRaster,
} from '../../../shared/pictures.ts';
import { atomically } from '../../../shared/store.ts';
import { type Taking, takePlace, takings } from '../patches/take-place.ts';
import { channels, indexOf } from '../pixels/raster.ts';
import { findPlacement } from '../placement/find-placement.ts';
import { placedOn } from '../placement/placement.ts';

/** A version of a picture, and how its changes are taken from it. */
export type Candidate = {
  /** The version's file. */
  readonly version: string;
  readonly taking: Taking;
};

/** All candidates, those that leave more of the picture as it is first. */
export const candidatesOf = (
  versions: ReadonlyArray<string>,
): ReadonlyArray<Candidate> =>
  takings.flatMap((taking) => versions.map((version) => ({ version, taking })));

/** A version with everything where the picture shows it. */
const aligned = (version: Raster, picture: Raster): Raster => {
  const { width, height } = picture;
  const whole = { left: 0, top: 0, width, height };
  const placement = findPlacement(version, picture, whole);
  return placement === null ? version : placedOn(version, placement);
};

/** A place, and the candidate it is taken from. */
export type Taken = { readonly box: Box; readonly from: Candidate };

const half = 0.5;

/** Whether the middle of a pixel is inside one of the areas. */
const isInside = (
  areas: ReadonlyArray<Box>,
  { width, height }: Raster,
  x: number,
  y: number,
) =>
  areas.some(
    ({ left, top, right, bottom }) =>
      x + half > left * width &&
      x + half < right * width &&
      y + half > top * height &&
      y + half < bottom * height,
  );

/** Puts the picture's own pixels back outside the areas. Changes `result`. */
const keepOutside = (
  picture: Raster,
  result: Raster,
  areas: ReadonlyArray<Box>,
) => {
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      if (!isInside(areas, result, x, y)) {
        const index = indexOf(result, x, y);
        for (const channel of channels) {
          result.pixels[index + channel] = picture.pixels[index + channel] ?? 0;
        }
      }
    }
  }
};

/**
 * Writes a picture with places that are taken from its versions. With areas,
 * nothing outside them changes, however far a place blends into its
 * surroundings.
 */
export const writeWith = Effect.fn('writeWith')(function* (
  base: string,
  taken: ReadonlyArray<Taken>,
  target: string,
  areas: ReadonlyArray<Box> | null = null,
) {
  const size = yield* sizeOf(base);
  const picture = yield* rasterOf(base, size);
  const result = { ...picture, pixels: picture.pixels.slice() };
  const places = taken.map(({ box }) => box);
  const files = [...new Set(taken.map(({ from }) => from.version))];
  for (const file of files) {
    const version = aligned(yield* rasterOf(file, size), picture);
    for (const { box, from } of taken) {
      if (from.version === file) {
        takePlace(version, result, box, { places, taking: from.taking });
      }
    }
  }
  if (areas !== null) {
    keepOutside(picture, result, areas);
  }
  yield* atomically(target, (draft) => writeRaster(draft, result));
});
