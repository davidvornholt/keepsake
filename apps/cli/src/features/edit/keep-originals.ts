import { Effect } from 'effect';
import { around, coverage, wholePicture } from '../../shared/boxes.ts';
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

const half = 0.5;

/**
 * Whether most of what is to be removed is on someone's face. It stays then,
 * since a face always comes back as the photo shows it.
 */
export const isOnFace = (people: ReadonlyArray<Person>, box: Box): boolean =>
  people.some(({ face }) => {
    const width =
      Math.min(box.right, face.right) - Math.max(box.left, face.left);
    const height =
      Math.min(box.bottom, face.bottom) - Math.max(box.top, face.top);
    return width > 0 && height > 0 && width * height > half * coverage(box);
  });

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

/** What is removed indeed, as nothing on a face is. */
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
