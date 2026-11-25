import type { MarkKind } from '../../contract.ts';
import type { Shape } from './glyphs.ts';

// What each mark looks like and is called. The owner has three wax pencils:
// white says a photo is wanted, yellow that it should change, red that it
// should go.

export type Wax = 'wax-white' | 'wax-yellow' | 'wax-red';

export type Look = {
  readonly shape: Shape;
  readonly wax: Wax;
  /** What the button says. */
  readonly says: string;
  /** What a photo that carries the mark says. */
  readonly said: string;
  /** What pressing the button leads to, in a sentence. */
  readonly does: string;
  readonly key: string;
};

export const lookOf: Readonly<Record<MarkKind, Look>> = {
  change: {
    shape: 'box',
    wax: 'wax-yellow',
    says: 'Change',
    said: 'To be changed',
    does: 'Say what should be different. An agent edits the photo again.',
    key: 'C',
  },
  'take-out': {
    shape: 'cross',
    wax: 'wax-red',
    says: 'Take out',
    said: 'To be taken out',
    does: 'Takes the photo out of the album. The photo itself stays.',
    key: 'X',
  },
  'put-in': {
    shape: 'circle',
    wax: 'wax-white',
    says: 'Put in',
    said: 'To be put in',
    does: 'Puts the photo in the album. An agent edits it first.',
    key: 'P',
  },
  swap: {
    shape: 'swap',
    wax: 'wax-white',
    says: 'Use this one instead',
    said: 'To be used instead',
    does: 'Puts this photo in the album and takes out the one in front of it.',
    key: 'S',
  },
};

/** What a mark is drawn from, the same each time it is drawn. */
export const seedTextOf = (photo: string, kind: MarkKind): string =>
  `${photo}:${kind}`;
