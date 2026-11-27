import { Effect } from 'effect';
import { around, wholePicture } from '../../shared/boxes.ts';
import type {
  Box,
  Outline,
  Person,
  Removal,
  Sign,
} from '../../shared/domain.ts';
import {
  frameOf,
  type Raster,
  rasterOf,
  sizeOf,
  writeRaster,
} from '../../shared/pictures.ts';
import { isOnFace } from '../../shared/removed.ts';
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
  /**
   * Everyone else, however small, animals too small for the image model to
   * draw, and what else is put back around them.
   */
  readonly bystanders: ReadonlyArray<Box>;
  /** The areas that keep the photo's own texture. */
  readonly textures: ReadonlyArray<Outline>;
  /** Where something was removed, which must not come back. */
  readonly gone: ReadonlyArray<Box>;
};

/** What an inspection found wrong, where the edit shows it. */
export type Mending = {
  readonly patches: ReadonlyArray<Box>;
  readonly textures: ReadonlyArray<Outline>;
};

const nothingToMend: Mending = { patches: [], textures: [] };

const boundsOf = ({ face, outline }: Person): Box =>
  around([
    face,
    ...outline.map(({ x, y }) => ({ left: x, top: y, right: x, bottom: y })),
  ]);

/** Why something on a face isn't removed. */
export const keptOnFace =
  'It is on someone’s face, which keepsake keeps as the photo shows it';

/** What is to be removed and stays, since it is on someone's face. */
export const removalsOnFaces = (
  { people, gone }: Pick<Originals, 'people' | 'gone'>,
  removed: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  removed.filter((_, index) => {
    const box = gone[index];
    return box !== undefined && isOnFace(people, box);
  });

/** What is removed indeed, as nothing on a face is, where the photo shows it. */
export const carriedOut = (
  { people, gone }: Pick<Originals, 'people' | 'gone'>,
  removed: ReadonlyArray<string>,
): ReadonlyArray<Removal> =>
  removed.flatMap((what, index) => {
    const box = gone[index];
    return box === undefined || isOnFace(people, box) ? [] : [{ what, box }];
  });

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
    mending,
  }: {
    readonly photoBox: Box;
    readonly placement: Placement;
    readonly mending: Mending;
  },
): void => {
  const photo = frameOf(photoBox, original);
  const moved = placed(original, edit, photo, placement);
  const inEdit = (box: Box) => placedBox(box, placement, original);
  const gone = originals.gone.map(inEdit);
  const bystanders = [...originals.bystanders.map(inEdit), ...mending.patches];
  changeOutside(gone, edit, () => {
    keepTexture(
      moved,
      edit,
      [
        ...originals.textures.map((outline) =>
          placedOutline(outline, placement, original),
        ),
        ...mending.textures,
      ],
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
    const there = placedPerson(person, exact, original);
    // Where something was removed, only their face comes back, since no
    // face of an edit is let through.
    changeOutside(
      gone,
      edit,
      () => {
        keepPerson(
          placed(original, edit, photo, exact),
          edit,
          there,
          writtenOn(person, originals.signs).map(
            (sign) => placedSign(sign, exact, original).box,
          ),
        );
      },
      [there.face],
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
  {
    crop,
    mending = nothingToMend,
  }: {
    /** What the edit shows of the photo. */
    readonly crop: Box;
    readonly mending?: Mending;
  },
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
      mending,
    });
    return;
  }
  const bystanders = [...originals.bystanders, ...mending.patches];
  changeOutside(originals.gone, edit, () => {
    keepTexture(original, edit, [...originals.textures, ...mending.textures]);
    for (const box of bystanders) {
      keepPatch(original, edit, box, bystanders);
    }
  });
  for (const person of originals.people) {
    const written = writtenOn(person, originals.signs);
    changeOutside(
      originals.gone,
      edit,
      () => {
        keepPerson(
          original,
          edit,
          person,
          written.map(({ box }) => box),
        );
      },
      [person.face],
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
 * Where an edit shows what was removed from the photo, in fractions of the
 * edit, as `putBack` finds it.
 */
export const removedIn = (
  original: Raster,
  edit: Raster,
  {
    crop,
    removals,
  }: {
    /** What the edit shows of the photo. */
    readonly crop: Box;
    readonly removals: ReadonlyArray<Removal>;
  },
): ReadonlyArray<Removal> => {
  const photo = frameOf(within(wholePicture, crop), original);
  const placement = findPlacement(original, edit, photo);
  return placement === null
    ? removals
    : removals.map(({ what, box }) => ({
        what,
        box: placedBox(box, placement, original),
      }));
};

/** The same, from the files of the photo and of the edit. */
export const removedFrom = Effect.fn('removedFrom')(function* (
  files: { readonly original: string; readonly edit: string },
  about: { readonly crop: Box; readonly removals: ReadonlyArray<Removal> },
) {
  if (about.removals.length === 0) {
    return [];
  }
  const size = yield* sizeOf(files.original);
  return removedIn(
    yield* rasterOf(files.original, size),
    yield* rasterOf(files.edit, size),
    about,
  );
});

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
  mending: Mending = nothingToMend,
) {
  const size = yield* sizeOf(files.original);
  const original = yield* rasterOf(files.original, size);
  const edit = yield* rasterOf(files.version, size);
  putBack(originals, original, edit, { crop, mending });
  yield* writeRaster(files.target, edit);
});
