import type { MarkKind } from '../../contract.ts';
import type { Shape } from './glyphs.ts';

// What each mark looks like and is called. The owner has three wax pencils:
// white says a photo is right or wanted, yellow that it should change, red
// that it should go.

export type Wax = 'wax-white' | 'wax-yellow' | 'wax-red';

export type Look = {
  readonly shape: Shape;
  readonly wax: Wax;
  /** What the button says. */
  readonly says: string;
  /** What a photo that carries the mark says. */
  readonly said: string;
  readonly key: string;
};

export const lookOf: Readonly<Record<MarkKind, Look>> = {
  keep: {
    shape: 'tick',
    wax: 'wax-white',
    says: 'Keep',
    said: 'Right as it is',
    key: 'K',
  },
  change: {
    shape: 'box',
    wax: 'wax-yellow',
    says: 'Change',
    said: 'To be changed',
    key: 'C',
  },
  'take-out': {
    shape: 'cross',
    wax: 'wax-red',
    says: 'Take out',
    said: 'To be taken out',
    key: 'X',
  },
  favorite: {
    shape: 'star',
    wax: 'wax-white',
    says: 'Favorite',
    said: 'To be a favorite',
    key: 'F',
  },
  'not-favorite': {
    shape: 'no-star',
    wax: 'wax-white',
    says: 'Favorite',
    said: 'No longer to be a favorite',
    key: 'F',
  },
  'put-in': {
    shape: 'circle',
    wax: 'wax-white',
    says: 'Put in',
    said: 'To be put in',
    key: 'P',
  },
  swap: {
    shape: 'swap',
    wax: 'wax-white',
    says: 'Swap',
    said: 'To be swapped in',
    key: 'S',
  },
  'leave-out': {
    shape: 'slash',
    wax: 'wax-white',
    says: 'Leave out',
    said: 'Rightly left out',
    key: 'L',
  },
};

/** What a mark is drawn from, the same each time it is drawn. */
export const seedTextOf = (photo: string, kind: MarkKind): string =>
  `${photo}:${kind}`;
