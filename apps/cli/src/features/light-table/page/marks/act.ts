import type { Mark, MarkKind, NewMark, PhotoView } from '../../contract.ts';
import { frontOf, type Index, isChosen, markedIn } from '../data/derive.ts';
import { lookOf } from './kinds.ts';

// What the owner can say about a photo, and what a press of a key or a
// button does about it. Saying the same thing twice takes it back.

/** The photo of the album that this one would take the place of, if there is one. */
export const swapFor = (index: Index, photo: PhotoView): PhotoView | null => {
  const front = frontOf(index, photo);
  return front !== null && isChosen(front) ? front : null;
};

/** The marks that make sense for a photo, in the order they are offered. */
export const kindsFor = (
  index: Index,
  photo: PhotoView,
): ReadonlyArray<MarkKind> => {
  if (isChosen(photo)) {
    return ['change', 'take-out'];
  }
  if (photo.standing.kind === 'open') {
    // Nothing is chosen yet, so there is nothing to say against the choice.
    return [];
  }
  return swapFor(index, photo) === null ? ['put-in'] : ['swap', 'put-in'];
};

/** What a mark is called on the button for this photo. */
export const nameFor = (
  index: Index,
  photo: PhotoView,
  kind: MarkKind,
): string => {
  if (kind === 'put-in' && swapFor(index, photo) !== null) {
    return 'Put in as well';
  }
  if (kind === 'change' && photo.standing.kind === 'picked') {
    return 'Wish for the edit';
  }
  return lookOf[kind].says;
};

/** What it leads to, in a sentence. */
export const effectFor = (
  index: Index,
  photo: PhotoView,
  kind: MarkKind,
): string => {
  if (kind === 'put-in' && swapFor(index, photo) !== null) {
    return 'Puts this photo in the album too. The one in front of it stays.';
  }
  if (kind === 'change' && photo.standing.kind === 'picked') {
    return 'Say what you want of the edit. It is done with the album.';
  }
  if (kind === 'take-out' && photo.standing.kind === 'picked') {
    return 'Takes the photo out of the choice, so it isn’t edited.';
  }
  return lookOf[kind].does;
};

/** What can be said about a photo, as a sentence for when something else was tried. */
export const offeredFor = (index: Index, photo: PhotoView): string => {
  const kinds = kindsFor(index, photo);
  const offered = kinds
    .map((kind) => `${nameFor(index, photo, kind)} (${lookOf[kind].key})`)
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
  return kinds.length === 0
    ? `This photo ${where}. Marks come once the best are chosen.`
    : `This photo ${where}: ${offered}.`;
};

export type Action =
  | { readonly does: 'make'; readonly wanted: NewMark }
  | { readonly does: 'take-back'; readonly mark: Mark }
  /** A change needs words first. */
  | { readonly does: 'compose'; readonly mark: Mark | null };

/** What choosing a mark for a photo does, or null when it makes no sense. */
export const actionFor = (
  index: Index,
  photo: PhotoView,
  kind: MarkKind,
): Action | null => {
  if (!kindsFor(index, photo).includes(kind)) {
    return null;
  }
  const { open } = markedIn(index, photo.id);
  if (kind === 'change') {
    return { does: 'compose', mark: open?.kind === 'change' ? open : null };
  }
  if (open?.kind === kind) {
    return { does: 'take-back', mark: open };
  }
  const other = kind === 'swap' ? (swapFor(index, photo)?.id ?? null) : null;
  return {
    does: 'make',
    wanted: { photo: photo.id, kind, note: '', boxes: [], other },
  };
};

const keys: Readonly<Record<string, MarkKind>> = {
  c: 'change',
  x: 'take-out',
  p: 'put-in',
  s: 'swap',
};

/** The mark a key stands for. */
export const kindOfKey = (key: string): MarkKind | null =>
  keys[key.toLowerCase()] ?? null;
