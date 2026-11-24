import { Effect } from 'effect';
import { around, wholePicture } from '../../shared/boxes.ts';
import type { Box, Outline, Person, Sign } from '../../shared/domain.ts';
import {
  frameOf,
  type Raster,
  rasterOf,
  sizeOf,
  writeRaster,
} from '../../shared/pictures.ts';
import { edgesBeyond, isCompleted } from './beyond.ts';
import { within } from './geometry.ts';
import { keepPatch } from './patches/keep-patch.ts';
import { changeOutside } from './patches/outside.ts';
import { isMostlyOn } from './people/outline.ts';
import { keepPerson } from './people/relight.ts';
import { findPlacement } from './placement/find-placement.ts';
import {
  movedOn,
  type Placement,
  placed,
  placedBox,
  placedOutline,
  placedPerson,
  placedSign,
  unmoved,
} from './placement/placement.ts';
import { shiftOf } from './placement/shift.ts';
import { keepSign } from './signs/keep-sign.ts';
import { keepTexture } from './textures/keep-texture.ts';

/** What an image model would redraw and nobody wants redrawn. */
export type Originals = {
  readonly people: ReadonlyArray<Person>;
  readonly signs: ReadonlyArray<Sign>;
  /** Everyone else, however small, and what else is put back around it. */
  readonly bystanders: ReadonlyArray<Box>;
  /** The areas that keep the photo's own texture. */
  readonly textures: ReadonlyArray<Outline>;
  /** Where something was removed, which must not come back. */
  readonly gone: ReadonlyArray<Box>;
};

const boundsOf = ({ face, outline }: Person): Box =>
  around([
    face,
    ...outline.map(({ x, y }) => ({ left: x, top: y, right: x, bottom: y })),
  ]);

/** The texts and logos on a person. */
const writtenOn = (
  person: Person,
  signs: ReadonlyArray<Sign>,
): ReadonlyArray<Sign> => signs.filter(({ box }) => isMostlyOn(person, box));

/** The signs that are on nobody. */
const signsApart = ({
  people,
  signs,
}: Pick<Originals, 'people' | 'signs'>): ReadonlyArray<Sign> =>
  signs.filter(({ box }) => !people.some((person) => isMostlyOn(person, box)));

/** Puts people and signs back where an edit has moved them. Changes `edit`. */
const keepMoved = (
  originals: Originals,
  original: Raster,
  edit: Raster,
  {
    photoBox,
    placement,
  }: { readonly photoBox: Box; readonly placement: Placement },
): void => {
  const photo = frameOf(photoBox, original);
  const moved = placed(original, edit, photo, placement);
  const inEdit = (box: Box) => placedBox(box, placement, original);
  const gone = originals.gone.map(inEdit);
  const bystanders = originals.bystanders.map(inEdit);
  changeOutside(gone, edit, () => {
    keepTexture(
      moved,
      edit,
      originals.textures.map((outline) =>
        placedOutline(outline, placement, original),
      ),
      inEdit(photoBox),
    );
    for (const box of bystanders) {
      keepPatch(moved, edit, box, bystanders);
    }
  });
  for (const person of originals.people) {
    const rough = placedPerson(person, placement, original);
    const shift = shiftOf(moved, edit, frameOf(boundsOf(rough), original));
    const exact = movedOn(placement, shift);
    keepPerson(
      placed(original, edit, photo, exact),
      edit,
      placedPerson(person, exact, original),
      writtenOn(person, originals.signs).map(
        (sign) => placedSign(sign, exact, original).box,
      ),
    );
  }
  const signs = signsApart(originals).map((sign) =>
    placedSign(sign, placement, original),
  );
  changeOutside(gone, edit, () => {
    for (const sign of signs) {
      keepSign(moved, edit, sign, signs);
    }
  });
};

/**
 * Puts the people and signs of a photo back into an edit of it, where the edit
 * shows them. What is written on a person comes back with them. Nobody small
 * comes back whom the photo cuts off and the edit completes, and nothing where
 * something was removed. Changes `edit`.
 */
export const putBack = (
  wanted: Originals,
  original: Raster,
  edit: Raster,
  crop: Box,
): void => {
  const originals = {
    ...wanted,
    bystanders: wanted.bystanders.filter((box) => !isCompleted(box, crop)),
  };
  const photoBox = within(wholePicture, crop);
  const placement = findPlacement(original, edit, frameOf(photoBox, original));
  if (placement !== null || edgesBeyond(crop) !== null) {
    keepMoved(originals, original, edit, {
      photoBox,
      placement: placement ?? unmoved,
    });
    return;
  }
  changeOutside(originals.gone, edit, () => {
    keepTexture(original, edit, originals.textures);
    for (const box of originals.bystanders) {
      keepPatch(original, edit, box, originals.bystanders);
    }
  });
  for (const person of originals.people) {
    const written = writtenOn(person, originals.signs);
    keepPerson(
      original,
      edit,
      person,
      written.map(({ box }) => box),
    );
  }
  const signs = signsApart(originals);
  changeOutside(originals.gone, edit, () => {
    for (const sign of signs) {
      keepSign(original, edit, sign, signs);
    }
  });
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
