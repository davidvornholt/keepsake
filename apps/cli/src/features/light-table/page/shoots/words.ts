import { count, span } from '../data/format.ts';
import type { ShootSummary } from './use-shoots.ts';

// What is printed beside a shoot, as on the edge of a film.

/** When it was, and how much of it there is. */
export const printOf = (shoot: ShootSummary): ReadonlyArray<string> => [
  span(shoot.from, shoot.to),
  `${shoot.photos} taken`,
  shoot.inAlbum === 0 ? 'No album yet' : `${shoot.inAlbum} in the album`,
];

/** What waits for the owner there. */
export const wantsOf = (
  shoot: ShootSummary,
): { readonly answers: string | null; readonly marks: string | null } => ({
  answers: shoot.newAnswers === 0 ? null : count(shoot.newAnswers, 'answer'),
  marks:
    shoot.openMarks === 0
      ? null
      : `${count(shoot.openMarks, 'mark')} to hand over`,
});

/** The whole of it in one sentence, for whoever can't see the page. */
export const sentenceOf = (shoot: ShootSummary): string => {
  const wants = wantsOf(shoot);
  return [
    shoot.about ?? shoot.name,
    ...printOf(shoot),
    ...[wants.answers, wants.marks].filter((part) => part !== null),
  ].join(', ');
};
