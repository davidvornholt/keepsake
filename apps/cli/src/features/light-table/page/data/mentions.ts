import type { Index } from './derive.ts';
import { fileName } from './format.ts';

// Reasons sometimes name a photo by its file. The owner is tired of file
// names, so the page shows the photo instead.

export type Part =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'photo'; readonly photo: string; readonly text: string };

const extension = /\.[a-z0-9]{2,5}$/iu;
/** A word that could be the name of a file, with or without its ending. */
const word = /[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}]{2,5})?/gu;

/** The name of a photo's file without its ending. */
export const stemOf = (id: string): string =>
  fileName(id).replace(extension, '');

const stems = new WeakMap<Index, ReadonlyMap<string, string>>();

const stemsOf = (index: Index): ReadonlyMap<string, string> => {
  const known = stems.get(index);
  if (known !== undefined) {
    return known;
  }
  const made = new Map(
    index.shoot.photos.map(({ id }) => [stemOf(id).toLowerCase(), id]),
  );
  stems.set(index, made);
  return made;
};

/** A text in parts: what is written, and the photos it names. */
export const partsOf = (index: Index, text: string): ReadonlyArray<Part> => {
  const names = stemsOf(index);
  const parts: Array<Part> = [];
  let from = 0;
  for (const match of text.matchAll(word)) {
    const photo = names.get(match[0].replace(extension, '').toLowerCase());
    if (photo !== undefined) {
      if (match.index > from) {
        parts.push({ kind: 'text', text: text.slice(from, match.index) });
      }
      parts.push({ kind: 'photo', photo, text: match[0] });
      from = match.index + match[0].length;
    }
  }
  if (from < text.length) {
    parts.push({ kind: 'text', text: text.slice(from) });
  }
  return parts;
};
