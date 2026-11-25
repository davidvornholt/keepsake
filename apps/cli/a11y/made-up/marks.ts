// Marks in every state there is.
import type { Mark } from '../../src/features/light-table/schemas.ts';

const made = '2026-05-10T18:00:00.000Z';
const handed = '2026-05-10T19:00:00.000Z';
const answered = '2026-05-10T20:00:00.000Z';

const mark = (id: string, photo: string, rest: Partial<Mark>): Mark => ({
  id,
  photo,
  kind: 'take-out',
  note: '',
  boxes: [],
  other: null,
  madeAt: made,
  handedOverAt: null,
  answer: null,
  seenAt: null,
  ...rest,
});

export const marks: ReadonlyArray<Mark> = [
  mark('a1', 'D80', {
    kind: 'change',
    note: 'Remove the rope in front of the gull.',
    boxes: [{ left: 0.2, top: 0.6, right: 0.5, bottom: 0.8 }],
  }),
  mark('a3', 'D40', {
    kind: 'swap',
    other: 'D30',
    note: 'I like it from behind.',
  }),
  mark('a4', 'D10', { kind: 'take-out' }),
  mark('a5', 'D170', { kind: 'put-in', handedOverAt: handed }),
  mark('a6', 'D160', { kind: 'take-out', handedOverAt: handed }),
  mark('a7', 'D120', {
    kind: 'change',
    note: 'Make the fog a little brighter.',
    handedOverAt: handed,
    answer: {
      outcome: 'done',
      note: 'The fog is brighter; nothing else changed.',
      at: answered,
    },
  }),
  mark('a8', 'D150', {
    kind: 'change',
    note: 'Remove the shadow.',
    boxes: [{ left: 0.3, top: 0.5, right: 0.6, bottom: 0.7 }],
    handedOverAt: handed,
    answer: {
      outcome: 'not-done',
      note: 'The shadow is the cat’s own, so it would look wrong without it. I tried it twice: the first time the paws floated above the stones, the second time a lighter patch was left where the shadow had been. A darker cat hides it better, if you would like to try that.',
      at: answered,
    },
  }),
  mark('a9', 'D30', {
    kind: 'change',
    note: 'More of the street.',
    handedOverAt: handed,
    answer: { outcome: 'done', note: 'The crop is wider.', at: answered },
    seenAt: '2026-05-10T21:00:00.000Z',
  }),
];
