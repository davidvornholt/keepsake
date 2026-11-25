// The moments of the made-up shoots. A photo's id is D and its number; the
// numbers go up in steps of ten from moment to moment.
import type { Box } from '../../src/shared/domain.ts';

export type Standing =
  | { readonly kind: 'album'; readonly favorite?: boolean }
  | { readonly kind: 'picked' }
  | { readonly kind: 'taken-out'; readonly because: string }
  /** `number` is the moment of the album that shows the same. */
  | {
      readonly kind: 'repeat';
      readonly number: number;
      readonly because: string;
    }
  | { readonly kind: 'weaker'; readonly because: string }
  | { readonly kind: 'no-room' }
  | { readonly kind: 'score' }
  | { readonly kind: 'unjudged' };

export type MadeUp = {
  readonly at: string;
  readonly frames: number;
  readonly score: number;
  readonly subject: string;
  readonly description: string;
  readonly standing: Standing;
  /** What the edit shows, in fractions of the camera's picture. */
  readonly crop?: Box;
  readonly version?: 'camera';
  readonly removed?: ReadonlyArray<{ what: string; box: Box }>;
  readonly wish?: string;
  /** How many finished photos were replaced. */
  readonly earlier?: number;
};

const tight: Box = { left: 0.14, top: 0.1, right: 0.9, bottom: 0.94 };
const beyond: Box = { left: -0.12, top: 0.04, right: 0.88, bottom: 0.96 };
const upright: Box = { left: 0.3, top: 0, right: 0.75, bottom: 1 };
const square: Box = { left: 0.2, top: 0.02, right: 0.84, bottom: 0.98 };

export const moments: ReadonlyArray<MadeUp> = [
  // Number 1: photos D10 to D12, and so on.
  {
    at: '2026-05-01T07:12:04',
    frames: 3,
    score: 8,
    subject: 'landscape',
    description: 'The river at dawn, with a ferry halfway across.',
    standing: { kind: 'album' },
    crop: tight,
  },
  {
    at: '2026-05-01T10:05:40',
    frames: 1,
    score: 6,
    subject: 'architecture',
    description: 'A tiled facade in blue and white.',
    standing: { kind: 'score' },
  },
  {
    at: '2026-05-01T10:40:11',
    frames: 2,
    score: 8,
    subject: 'architecture',
    description: 'A yellow tram climbs a steep street.',
    standing: { kind: 'album', favorite: true },
    crop: upright,
  },
  {
    at: '2026-05-01T10:43:52',
    frames: 2,
    score: 7,
    subject: 'architecture',
    description: 'The same yellow tram from behind.',
    standing: {
      kind: 'repeat',
      number: 3,
      because: 'The tram shows its front and the street in the other photo.',
    },
  },
  {
    at: '2026-05-01T13:20:30',
    frames: 1,
    score: 4,
    subject: 'food',
    description: 'Custard tarts on a plate.',
    standing: { kind: 'score' },
  },
  {
    at: '2026-05-01T19:55:18',
    frames: 4,
    score: 8,
    subject: 'landscape',
    description: 'The sun sets behind the bridge.',
    standing: { kind: 'album' },
  },
  {
    at: '2026-05-02T08:30:00',
    frames: 1,
    score: 7,
    subject: 'detail',
    description: 'Laundry dries on a line between two houses.',
    standing: {
      kind: 'weaker',
      because: 'The line leads the eye out of the photo, and little happens.',
    },
  },
  {
    at: '2026-05-02T09:15:27',
    frames: 5,
    score: 8,
    subject: 'bird',
    description: 'A gull lands on a post in the harbour.',
    standing: { kind: 'album' },
    crop: beyond,
    wish: 'Give it more room in the direction it looks.',
  },
  {
    at: '2026-05-02T09:20:05',
    frames: 2,
    score: 7,
    subject: 'bird',
    description: 'A gull sits on a post.',
    standing: { kind: 'taken-out', because: 'There is another gull already.' },
  },
  {
    at: '2026-05-02T11:00:00',
    frames: 1,
    score: 0,
    subject: 'other',
    description: '',
    standing: { kind: 'unjudged' },
  },
  {
    at: '2026-05-02T16:45:33',
    frames: 2,
    score: 7,
    subject: 'plant',
    description: 'Jacaranda trees bloom along a square.',
    standing: { kind: 'album' },
    crop: square,
    version: 'camera',
  },
  {
    at: '2026-05-03T06:50:09',
    frames: 2,
    score: 9,
    subject: 'landscape',
    description: 'Fog lies between the hills before sunrise.',
    standing: { kind: 'album', favorite: true },
    earlier: 2,
    wish: 'Make the fog a little brighter.',
  },
  {
    at: '2026-05-03T12:10:44',
    frames: 1,
    score: 7,
    subject: 'person',
    description: 'A street musician, seen from behind.',
    standing: { kind: 'no-room' },
  },
  {
    at: '2026-05-03T12:30:02',
    frames: 3,
    score: 6,
    subject: 'other',
    description: 'Paint flakes off a wooden door.',
    standing: { kind: 'score' },
  },
  {
    at: '2026-05-03T18:05:21',
    frames: 3,
    score: 8,
    subject: 'animal',
    description: 'A cat sleeps on a warm wall.',
    standing: { kind: 'album' },
    crop: tight,
    removed: [
      {
        what: 'an empty bottle',
        box: { left: 0.08, top: 0.7, right: 0.14, bottom: 0.88 },
      },
      {
        what: 'a cable above the wall',
        box: { left: 0.4, top: 0.06, right: 0.98, bottom: 0.14 },
      },
    ],
  },
  {
    at: '2026-05-04T10:00:15',
    frames: 1,
    score: 8,
    subject: 'architecture',
    description: 'Light falls through the arches of a cloister.',
    standing: { kind: 'album' },
  },
  {
    at: '2026-05-04T10:02:48',
    frames: 1,
    score: 7,
    subject: 'architecture',
    description: 'The arches of the cloister from the side.',
    standing: {
      kind: 'repeat',
      number: 16,
      because: 'The arches are more regular in the other photo.',
    },
  },
  {
    at: '2026-05-04T15:30:07',
    frames: 6,
    score: 5,
    subject: 'person',
    description: 'A crowd waits for a tram.',
    standing: { kind: 'score' },
  },
  {
    at: '2026-05-04T19:40:36',
    frames: 2,
    score: 8,
    subject: 'landscape',
    description: 'Roofs glow in the last light.',
    standing: { kind: 'picked' },
  },
];
