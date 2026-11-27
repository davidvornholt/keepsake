import type {
  CarryingOut,
  Choice,
  Mark,
  NewChoice,
  NewMark,
  ShootView,
} from '../../contract.ts';

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

export const wantedOf = ({ photo, note, boxes }: Mark): NewMark => ({
  photo,
  note,
  boxes,
});

/**
 * What the owner chose, as waiting until keepsake has done it. It takes the
 * place of what they chose for those photos before, and what is so already
 * waits for nothing.
 */
export const withChoice = (
  shoot: ShootView,
  { photo, wants, because, instead }: NewChoice,
  now: string,
): ShootView => {
  const action = `${draftPrefix}${now}`;
  const part = (one: string, wanted: Choice['wants']): Choice => ({
    action,
    photo: one,
    wants: wanted,
    because: wanted === 'out' ? because : null,
    madeAt: now,
    failed: null,
  });
  const parts = [
    part(photo, wants),
    ...(instead === null ? [] : [part(instead, 'out')]),
  ];
  const isIn = (one: string) => {
    const kind = shoot.photos.find(({ id }) => id === one)?.standing.kind;
    return kind === 'album' || kind === 'picked';
  };
  const replaced = new Set(
    shoot.choices
      .filter((one) => parts.some((made) => made.photo === one.photo))
      .map((one) => one.action),
  );
  return {
    ...shoot,
    choices: [
      ...shoot.choices.filter((one) => !replaced.has(one.action)),
      ...parts.filter((one) => isIn(one.photo) !== (one.wants === 'in')),
    ],
  };
};

/** Forgets a choice that couldn't be done. */
export const withoutChoice = (shoot: ShootView, action: string): ShootView => ({
  ...shoot,
  choices: shoot.choices.filter((one) => one.action !== action),
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

/** What waits for the owner, noted as seen once they looked at its photo. */
export const carryingSeen = (
  carrying: CarryingOut,
  keys: ReadonlySet<string>,
  now: string,
): CarryingOut => {
  const { stopped } = carrying;
  return stopped === null ||
    stopped.seenAt !== null ||
    !keys.has(`stop:${stopped.id}`)
    ? carrying
    : { ...carrying, stopped: { ...stopped, seenAt: now } };
};

/** What is new and was shown, by the keys of `newsItemsOf`, noted as seen. */
export const withSeen = (
  shoot: ShootView,
  keys: ReadonlySet<string>,
  now: string,
): ShootView => ({
  ...shoot,
  marks: shoot.marks.map((mark) =>
    mark.answer !== null &&
    mark.seenAt === null &&
    keys.has(`answer:${mark.id}:${mark.answer.at}`)
      ? { ...mark, seenAt: now }
      : mark,
  ),
  added: shoot.added.map((one) =>
    one.seenAt === null && keys.has(`added:${one.photo}:${one.at}`)
      ? { ...one, seenAt: now }
      : one,
  ),
  carrying: carryingSeen(shoot.carrying, keys, now),
});

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
