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
import { withMargin } from './places.ts';

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

type Span = { readonly from: number; readonly to: number };

/**
 * How much of a change is kept at a point along one side of a mark: all of it
 * inside the mark, less and less across the little around it, none beyond.
 */
const along = (at: number, mark: Span, around: Span): number => {
  if (at >= mark.from && at <= mark.to) {
    return 1;
  }
  const [distance, room] =
    at < mark.from
      ? [mark.from - at, mark.from - around.from]
      : [at - mark.to, around.to - mark.to];
  return room <= 0 ? 0 : Math.max(0, 1 - distance / room);
};

/** How much of a change is kept at a pixel, as the nearest mark allows. */
const keptAt = (
  marks: ReadonlyArray<Box>,
  { width, height }: Raster,
  x: number,
  y: number,
): number => {
  const across = (x + half) / width;
  const down = (y + half) / height;
  return Math.max(
    0,
    ...marks.map((mark) => {
      const around = withMargin(mark);
      return Math.min(
        along(
          across,
          { from: mark.left, to: mark.right },
          { from: around.left, to: around.right },
        ),
        along(
          down,
          { from: mark.top, to: mark.bottom },
          { from: around.top, to: around.bottom },
        ),
      );
    }),
  );
};

/**
 * Keeps the change inside the marks, fades it out across the little around
 * them and puts the picture's own pixels back beyond. Changes `result`.
 */
const keepToMarks = (
  picture: Raster,
  result: Raster,
  marks: ReadonlyArray<Box>,
) => {
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const kept = keptAt(marks, result, x, y);
      const index = indexOf(result, x, y);
      for (const channel of channels) {
        const own = picture.pixels[index + channel] ?? 0;
        const changed = result.pixels[index + channel] ?? 0;
        result.pixels[index + channel] =
          kept === 0 ? own : Math.round(kept * changed + (1 - kept) * own);
      }
    }
  }
};

/**
 * Writes a picture with places that are taken from its versions. With marks,
 * nothing changes beyond the little around them, however far a place blends
 * into its surroundings.
 */
export const writeWith = Effect.fn('writeWith')(function* (
  base: string,
  taken: ReadonlyArray<Taken>,
  target: string,
  marks: ReadonlyArray<Box> | null = null,
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
  if (marks !== null) {
    keepToMarks(picture, result, marks);
  }
  yield* atomically(target, (draft) => writeRaster(draft, result));
});
