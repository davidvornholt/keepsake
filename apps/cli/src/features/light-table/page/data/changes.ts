import type { Mark, NewMark, ShootView } from '../../contract.ts';

// What a change does to a shoot, worked out here so that the page shows it
// before keepsake has answered. Keepsake's answer replaces it afterwards.

export const draftPrefix = 'draft-';

export const isDraft = (id: string): boolean => id.startsWith(draftPrefix);

/** A mark as it will be once keepsake has saved it. */
export const draftOf = (wanted: NewMark, id: string, now: string): Mark => ({
  ...wanted,
  id,
  note: wanted.note.trim(),
  madeAt: now,
  handedOverAt: null,
  answer: null,
  seenAt: null,
});

export const wantedOf = ({
  photo,
  kind,
  note,
  boxes,
  other,
}: Mark): NewMark => ({
  photo,
  kind,
  note,
  boxes,
  other,
});

/** The open mark that a new one takes the place of. */
export const replacedBy = (
  marks: ReadonlyArray<Mark>,
  mark: Mark,
): Mark | null =>
  marks.find((one) => one.photo === mark.photo && one.handedOverAt === null) ??
  null;

/** A new mark takes the place of the open one, and answers count as seen. */
export const withMark = (
  marks: ReadonlyArray<Mark>,
  mark: Mark,
): ReadonlyArray<Mark> => {
  const replaced = replacedBy(marks, mark);
  return [
    ...marks
      .filter((one) => one.id !== replaced?.id)
      .map((one) =>
        one.photo === mark.photo && one.answer !== null && one.seenAt === null
          ? { ...one, seenAt: mark.madeAt }
          : one,
      ),
    mark,
  ];
};

export const withoutMark = (
  marks: ReadonlyArray<Mark>,
  id: string,
): ReadonlyArray<Mark> => marks.filter((mark) => mark.id !== id);

/** Puts the mark keepsake saved in the place of its draft. */
export const withSaved = (
  marks: ReadonlyArray<Mark>,
  draft: string,
  saved: Mark,
): ReadonlyArray<Mark> =>
  marks.map((mark) => (mark.id === draft ? saved : mark));

export const withSeen = (
  marks: ReadonlyArray<Mark>,
  id: string,
  now: string,
): ReadonlyArray<Mark> =>
  marks.map((mark) => (mark.id === id ? { ...mark, seenAt: now } : mark));

export const withLabels = (
  shoot: ShootView,
  photo: string,
  labels: ReadonlyArray<string>,
): ShootView => ({
  ...shoot,
  photos: shoot.photos.map((one) =>
    one.id === photo ? { ...one, labels } : one,
  ),
});

/** The favorite heart of a photo of the album, as Immich will have it. */
export const withFavorite = (
  shoot: ShootView,
  photo: string,
  favorite: boolean,
): ShootView => ({
  ...shoot,
  photos: shoot.photos.map((one) =>
    one.id === photo && one.standing.kind === 'album'
      ? { ...one, standing: { ...one.standing, favorite } }
      : one,
  ),
});

type Rated = NonNullable<ShootView['rating']>['ratings'][number];

export const withRating = (shoot: ShootView, rated: Rated): ShootView =>
  shoot.rating === null
    ? shoot
    : {
        ...shoot,
        rating: {
          ...shoot.rating,
          ratings: [
            ...shoot.rating.ratings.filter(
              ({ moment }) => moment !== rated.moment,
            ),
            rated,
          ],
        },
      };

/** Labels as keepsake keeps them: trimmed, each once, none empty. */
export const tidyLabels = (
  labels: ReadonlyArray<string>,
): ReadonlyArray<string> => [
  ...new Set(
    labels
      .map((label) => label.trim().replaceAll(/\s+/gu, ' '))
      .filter((label) => label !== ''),
  ),
];
