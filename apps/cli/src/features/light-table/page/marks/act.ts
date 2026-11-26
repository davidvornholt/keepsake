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

const bringsIn = (mark: Mark | null): mark is Mark =>
  mark?.kind === 'put-in' || mark?.kind === 'swap';

/**
 * The mark that what the owner writes about a photo goes into: a change of a
 * photo that is chosen, or the wish that goes with a photo marked to come
 * in. Only a change can show where, since a photo that comes in may have no
 * edit to change places of yet. Null where there is nothing to write about.
 */
export type Writing =
  | { readonly into: 'change'; readonly mark: Mark | null }
  | { readonly into: 'wish'; readonly mark: Mark };

export const writingFor = (index: Index, photo: PhotoView): Writing | null => {
  const { open } = markedIn(index, photo.id);
  if (isChosen(photo)) {
    return { into: 'change', mark: open?.kind === 'change' ? open : null };
  }
  return bringsIn(open) ? { into: 'wish', mark: open } : null;
};

/** Whether the pencil of this kind is drawn on the photo. */
export const isMadeOn = (
  index: Index,
  photo: PhotoView,
  kind: MarkKind,
): boolean => {
  if (kind === 'change') {
    return (writingFor(index, photo)?.mark?.note ?? '') !== '';
  }
  return markedIn(index, photo.id).open?.kind === kind;
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
  const bringing: ReadonlyArray<MarkKind> =
    swapFor(index, photo) === null ? ['put-in'] : ['swap', 'put-in'];
  // Once it is to come in, the owner can say what they want of its edit.
  return writingFor(index, photo) === null ? bringing : [...bringing, 'change'];
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
  if (kind === 'change' && photo.standing.kind !== 'album') {
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
  if (kind === 'change' && !isChosen(photo)) {
    return 'Say what you want of the edit. It goes with the photo into the album.';
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
  /** A change or a wish needs words first. */
  | { readonly does: 'compose' };

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
    return { does: 'compose' };
  }
  if (open?.kind === kind) {
    return { does: 'take-back', mark: open };
  }
  const other = kind === 'swap' ? (swapFor(index, photo)?.id ?? null) : null;
  // Putting the photo in another way keeps the wish for its edit.
  const note = bringsIn(open) ? open.note : '';
  return {
    does: 'make',
    wanted: { photo: photo.id, kind, note, boxes: [], other },
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
