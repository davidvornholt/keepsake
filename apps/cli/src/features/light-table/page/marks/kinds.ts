import type { Shape } from './glyphs.ts';

// What each pencil looks like and is called. The owner has three wax pencils:
// white says a photo is wanted, yellow that it should change, red that it
// should go. Only a change is a mark for keepsake; the others are done at
// once, and their wax shows only while they wait for that.

export type Pencil = 'change' | 'take-out' | 'put-in' | 'swap';

export type Wax = 'wax-white' | 'wax-yellow' | 'wax-red';

export type Look = {
  readonly shape: Shape;
  readonly wax: Wax;
  /** What the button says. */
  readonly says: string;
  /** What a photo that carries the pencil says. */
  readonly said: string;
  /** What pressing the button leads to, in a sentence. */
  readonly does: string;
  readonly key: string;
};

export const lookOf: Readonly<Record<Pencil, Look>> = {
  change: {
    shape: 'box',
    wax: 'wax-yellow',
    says: 'Change',
    said: 'To be changed',
    does: 'Say what should be different. Keepsake edits the photo again.',
    key: 'C',
  },
  'take-out': {
    shape: 'cross',
    wax: 'wax-red',
    says: 'Take out',
    said: 'To be taken out',
    does: 'Takes the photo out of the album now. The photo itself stays.',
    key: 'X',
  },
  'put-in': {
    shape: 'circle',
    wax: 'wax-white',
    says: 'Put in',
    said: 'To be put in',
    does: 'Chooses the photo now, and puts it in the album if it is edited.',
    key: 'P',
  },
  swap: {
    shape: 'swap',
    wax: 'wax-white',
    says: 'Use this one instead',
    said: 'To be used instead',
    does: 'Puts this photo in now, and takes out the one in front of it.',
    key: 'S',
  },
};

/** What a pencil's wax is drawn from, the same each time it is drawn. */
export const seedTextOf = (photo: string, pencil: Pencil): string =>
  `${photo}:${pencil}`;
