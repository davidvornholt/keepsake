import type { Mark, NewChoice, PhotoView } from '../../contract.ts';
import {
  frontOf,
  type Index,
  isChosen,
  markedIn,
  pencilOf,
  type Waiting,
} from '../data/derive.ts';
import { stemOf } from '../data/mentions.ts';
import type { Choosing } from '../data/store-state.ts';
import { lookOf, type Pencil } from './kinds.ts';

// What the owner can say about a photo, and what a press of a key or a
// button does about it. Taking a photo out and putting one in happen at
// once; a change is a mark for keepsake. Pressing a pencil again while what
// it does still waits takes it back.

/** Why a photo that the owner took out isn't in the album, when they gave no reason. */
export const outReason = 'You didn’t want it in the album.';

/** Why the photo that another one took the place of isn't in the album. */
export const insteadReason = (photo: string): string =>
  `You chose ${stemOf(photo)} instead.`;

/** The photo of the album that this one would take the place of, if there is one. */
export const swapFor = (index: Index, photo: PhotoView): PhotoView | null => {
  const front = frontOf(index, photo);
  return front !== null && isChosen(front) ? front : null;
};

/**
 * The change that what the owner writes about a photo goes into, which only
 * a chosen photo has. Null where there is nothing to write about.
 */
export type Writing = { readonly mark: Mark | null };

export const writingFor = (index: Index, photo: PhotoView): Writing | null => {
  if (!isChosen(photo)) {
    return null;
  }
  const { open } = markedIn(index, photo.id);
  return { mark: open };
};

/** The pencil that what waits for a photo was made with, if anything waits. */
const waitingPencil = (index: Index, photo: PhotoView): Pencil | null => {
  const waits = index.waiting.get(photo.id);
  return waits === undefined ? null : pencilOf(waits);
};

/** Whether the pencil is drawn on the photo. */
export const isMadeOn = (
  index: Index,
  photo: PhotoView,
  pencil: Pencil,
): boolean =>
  pencil === 'change'
    ? (writingFor(index, photo)?.mark?.note ?? '') !== ''
    : waitingPencil(index, photo) === pencil;

/** The pencils that make sense for a photo, in the order they are offered. */
export const pencilsFor = (
  index: Index,
  photo: PhotoView,
): ReadonlyArray<Pencil> => {
  if (isChosen(photo)) {
    return ['change', 'take-out'];
  }
  if (photo.standing.kind === 'open') {
    // Nothing is chosen yet, so there is nothing to say against the choice.
    return [];
  }
  return swapFor(index, photo) === null ? ['put-in'] : ['swap', 'put-in'];
};

/** What a pencil is called on the button for this photo. */
export const nameFor = (
  index: Index,
  photo: PhotoView,
  pencil: Pencil,
): string => {
  if (pencil === 'put-in' && swapFor(index, photo) !== null) {
    return 'Put in as well';
  }
  if (pencil === 'put-in' && photo.standing.kind === 'taken-out') {
    return 'Put back';
  }
  if (pencil === 'change' && photo.standing.kind !== 'album') {
    return 'Wish for the edit';
  }
  return lookOf[pencil].says;
};

/** What it leads to, in a sentence. */
export const effectFor = (
  index: Index,
  photo: PhotoView,
  pencil: Pencil,
): string => {
  if (pencil !== 'change' && isMadeOn(index, photo, pencil)) {
    return 'Keepsake does it once the work going on now is done. Press again to leave the photo as it is.';
  }
  if (pencil === 'put-in' && swapFor(index, photo) !== null) {
    return 'Puts this photo in too. The one in front of it stays.';
  }
  if (pencil === 'change' && photo.standing.kind === 'picked') {
    return 'Say what you want of the edit. It is done with the album.';
  }
  if (pencil === 'take-out' && photo.standing.kind === 'picked') {
    return 'Takes the photo out of the choice now, so it isn’t edited.';
  }
  return lookOf[pencil].does;
};

/** What can be said about a photo, as a sentence for when something else was tried. */
export const offeredFor = (index: Index, photo: PhotoView): string => {
  const pencils = pencilsFor(index, photo);
  const offered = pencils
    .map((pencil) => `${nameFor(index, photo, pencil)} (${lookOf[pencil].key})`)
    .join(', ');
  const stands = {
    album: 'is in the album',
    picked: 'is chosen for the album',
    open: 'isn’t decided yet',
    'taken-out': 'isn’t in the album',
    similar: 'isn’t in the album',
    'left-out': 'isn’t in the album',
  } as const;
  const where = stands[photo.standing.kind];
  return pencils.length === 0
    ? `This photo ${where}. Marks come once the best are chosen.`
    : `This photo ${where}: ${offered}.`;
};

export type Action =
  | ({ readonly does: 'choose' } & Choosing)
  /** A change needs words first. */
  | { readonly does: 'compose' };

/** Takes a photo out, for the reason it had before or the plain one. */
const takingOut = (photo: PhotoView): NewChoice => ({
  photo: photo.id,
  wants: 'out',
  because:
    photo.standing.kind === 'taken-out'
      ? (photo.standing.because ?? outReason)
      : outReason,
  instead: null,
});

const puttingIn = (photo: PhotoView): NewChoice => ({
  photo: photo.id,
  wants: 'in',
  because: null,
  instead: null,
});

/** What takes back a choice that waits: the photo stays as it is. */
const takingBack = (photo: PhotoView): NewChoice =>
  isChosen(photo) ? puttingIn(photo) : takingOut(photo);

/**
 * The whole of what waits for a photo, as the owner chose it, so that it
 * can be chosen again: a swap with both its photos, whichever of them it
 * is asked for.
 */
const wholeOf = (index: Index, waits: Waiting): NewChoice => {
  const parts = index.shoot.choices.filter(
    ({ action, failed }) => action === waits.choice.action && failed === null,
  );
  const comesIn = parts.find(({ wants }) => wants === 'in');
  const leaving = parts.find(({ wants }) => wants === 'out');
  return comesIn === undefined
    ? {
        photo: waits.choice.photo,
        wants: 'out',
        because: waits.choice.because,
        instead: null,
      }
    : {
        photo: comesIn.photo,
        wants: 'in',
        because: leaving?.because ?? null,
        instead: leaving?.photo ?? null,
      };
};

/**
 * What undoes a choice that was done: a photo taken out comes back, and one
 * put in goes out again, also the one that another took the place of.
 */
const undoOf = (
  photo: PhotoView,
  { wants, instead }: NewChoice,
  index: Index,
): NewChoice => {
  if (wants === 'out') {
    return puttingIn(photo);
  }
  const other = instead === null ? undefined : index.byId.get(instead);
  return other === undefined
    ? takingOut(photo)
    : {
        ...puttingIn(other),
        instead: photo.id,
        because: takingOut(photo).because,
      };
};

const choosing = (
  index: Index,
  photo: PhotoView,
  wanted: NewChoice,
): Action => ({
  does: 'choose',
  wanted,
  back: undoOf(photo, wanted, index),
  restores: null,
});

/** What pressing a pencil does, or null when it makes no sense. */
export const actionFor = (
  index: Index,
  photo: PhotoView,
  pencil: Pencil,
): Action | null => {
  if (!pencilsFor(index, photo).includes(pencil)) {
    return null;
  }
  if (pencil === 'change') {
    return { does: 'compose' };
  }
  const waits = index.waiting.get(photo.id);
  if (waits !== undefined && pencilOf(waits) === pencil) {
    return {
      does: 'choose',
      wanted: takingBack(photo),
      back: wholeOf(index, waits),
      restores: waits.choice.action,
    };
  }
  if (pencil === 'take-out') {
    return choosing(index, photo, takingOut(photo));
  }
  const front = pencil === 'swap' ? swapFor(index, photo) : null;
  return choosing(
    index,
    photo,
    front === null
      ? puttingIn(photo)
      : {
          ...puttingIn(photo),
          instead: front.id,
          because: insteadReason(photo.id),
        },
  );
};

const keys: Readonly<Record<string, Pencil>> = {
  c: 'change',
  x: 'take-out',
  p: 'put-in',
  s: 'swap',
};

/** The pencil a key stands for. */
export const pencilOfKey = (key: string): Pencil | null =>
  keys[key.toLowerCase()] ?? null;
