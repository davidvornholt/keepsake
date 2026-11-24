import { Effect } from 'effect';
import { around, wholePicture } from '../../shared/boxes.ts';
import type { Box, Person, Sign } from '../../shared/domain.ts';
import {
  type Frame,
  frameOf,
  type Raster,
  rasterOf,
  sizeOf,
  writeRaster,
} from '../../shared/pictures.ts';
import { edgesBeyond } from './beyond.ts';
import { within } from './geometry.ts';
import { isMostlyOn } from './people/outline.ts';
import { keepPerson } from './people/relight.ts';
import { findPlacement } from './placement/find-placement.ts';
import {
  movedOn,
  type Placement,
  placed,
  placedPerson,
  placedSign,
  unmoved,
} from './placement/placement.ts';
import { shiftOf } from './placement/shift.ts';
import { keepSign } from './signs/keep-sign.ts';

/** What an image model would redraw and nobody wants redrawn. */
export type Originals = {
  readonly people: ReadonlyArray<Person>;
  readonly signs: ReadonlyArray<Sign>;
};

const boundsOf = ({ face, outline }: Person): Box =>
  around([
    face,
    ...outline.map(({ x, y }) => ({ left: x, top: y, right: x, bottom: y })),
  ]);

/** Puts people and signs back where an edit has moved them. Changes `edit`. */
const keepMoved = (
  { people, signs }: Originals,
  original: Raster,
  edit: Raster,
  {
    photo,
    placement,
  }: { readonly photo: Frame; readonly placement: Placement },
): void => {
  const moved = placed(original, edit, photo, placement);
  for (const person of people) {
    const rough = placedPerson(person, placement, original);
    const shift = shiftOf(moved, edit, frameOf(boundsOf(rough), original));
    const exact = movedOn(placement, shift);
    keepPerson(
      placed(original, edit, photo, exact),
      edit,
      placedPerson(person, exact, original),
    );
  }
  for (const sign of signs) {
    keepSign(moved, edit, placedSign(sign, placement, original));
  }
};

/**
 * Puts the people and signs of a photo back into an edit of it, where the edit
 * shows them. What is written on a person comes back with them. Changes `edit`.
 */
export const putBack = (
  { people, signs: everySign }: Originals,
  original: Raster,
  edit: Raster,
  crop: Box,
): void => {
  const signs = everySign.filter(
    ({ box }) => !people.some((person) => isMostlyOn(person, box)),
  );
  const photo = frameOf(within(wholePicture, crop), original);
  const placement = findPlacement(original, edit, photo);
  if (placement !== null || edgesBeyond(crop) !== null) {
    keepMoved({ people, signs }, original, edit, {
      photo,
      placement: placement ?? unmoved,
    });
    return;
  }
  for (const person of people) {
    keepPerson(original, edit, person);
  }
  for (const sign of signs) {
    keepSign(original, edit, sign);
  }
};

/**
 * Writes a version of a photo in which the people and signs are the photo's
 * own, in the light the version gave them.
 */
export const keepOriginals = Effect.fn('keepOriginals')(function* (
  originals: Originals,
  crop: Box,
  files: {
    readonly original: string;
    readonly version: string;
    readonly target: string;
  },
) {
  const size = yield* sizeOf(files.original);
  const original = yield* rasterOf(files.original, size);
  const edit = yield* rasterOf(files.version, size);
  putBack(originals, original, edit, crop);
  yield* writeRaster(files.target, edit);
});
