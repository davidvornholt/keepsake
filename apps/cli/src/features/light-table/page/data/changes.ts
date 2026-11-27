import type {
  CarryingOut,
  Choice,
  Mark,
  NewChoice,
  NewMark,
  PhotoView,
  ShootView,
  Standing,
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

type Part = Pick<Choice, 'photo' | 'wants' | 'because'>;

const isIn = (photo: PhotoView | undefined): boolean =>
  photo?.standing.kind === 'album' || photo?.standing.kind === 'picked';

/** Where a photo stands once keepsake has done what was chosen for it. */
const standingAfter = (
  shoot: ShootView,
  photo: PhotoView,
  { wants, because }: Part,
  now: string,
): Standing => {
  const { standing } = photo;
  if (wants === 'out') {
    return standing.kind === 'taken-out' && standing.because === because
      ? standing
      : { kind: 'taken-out', at: now, because };
  }
  if (isIn(photo)) {
    return standing;
  }
  // A finished photo goes into the album there is. Its own page in Immich
  // is known once it is there, so until then it leads to the album.
  return shoot.album !== null && photo.edit !== null
    ? { kind: 'album', url: shoot.album.url, favorite: false }
    : { kind: 'picked' };
};

/**
 * The stacks once a photo that comes in stands in front: of a stack of its
 * own, or of the one in front that it takes the place of, which then lies
 * by itself.
 */
const stacksAfter = (
  shoot: ShootView,
  photo: string,
  instead: string | null,
): ShootView['stacks'] => {
  const stack = shoot.stacks.find(({ photos }) => photos.includes(photo));
  if (stack === undefined || stack.front === photo) {
    return shoot.stacks;
  }
  const moving =
    instead === stack.front
      ? stack.photos.filter((one) => one !== instead)
      : [photo];
  const order = new Map(shoot.photos.map(({ id }, place) => [id, place]));
  const placeOf = ({ front }: { readonly front: string }) =>
    order.get(front) ?? 0;
  return [
    ...shoot.stacks.filter((one) => one !== stack),
    {
      front: stack.front,
      photos: stack.photos.filter((one) => !moving.includes(one)),
    },
    { front: photo, photos: moving },
  ].toSorted((left, right) => placeOf(left) - placeOf(right));
};

/**
 * The shoot as keepsake will have it once it has done these parts of a
 * choice: the photos in or out, the one that comes in in front of its
 * stack, and what was written for a change of a photo that goes out
 * forgotten.
 */
const withDone = (
  shoot: ShootView,
  parts: ReadonlyArray<Part>,
  instead: string | null,
  now: string,
): ShootView => {
  const comesIn = parts.find(({ wants }) => wants === 'in')?.photo ?? null;
  const stacks =
    comesIn === null ? shoot.stacks : stacksAfter(shoot, comesIn, instead);
  const stackOf = new Map(
    stacks.flatMap(({ front, photos }) => photos.map((one) => [one, front])),
  );
  const leaving = new Set(
    parts.filter(({ wants }) => wants === 'out').map(({ photo }) => photo),
  );
  return {
    ...shoot,
    stacks,
    photos: shoot.photos.map((photo) => {
      const part = parts.find((one) => one.photo === photo.id);
      const stack = stackOf.get(photo.id) ?? photo.stack;
      const standing =
        part === undefined
          ? photo.standing
          : standingAfter(shoot, photo, part, now);
      return {
        ...photo,
        stack,
        standing:
          standing.kind === 'similar' && stack !== photo.id
            ? { ...standing, to: stack }
            : standing,
      };
    }),
    marks: shoot.marks.filter(
      (mark) => !(leaving.has(mark.photo) && mark.handedOverAt === null),
    ),
  };
};

/**
 * What the owner chose, in the place of what they chose for those photos
 * before. Keepsake does it at once unless a command works on the shoot, so
 * the page shows it done; while one works, it shows it waiting until
 * keepsake has done it, and what is so already waits for nothing.
 */
export const withChoice = (
  shoot: ShootView,
  { photo, wants, because, instead }: NewChoice,
  { now, isWorking }: { readonly now: string; readonly isWorking: boolean },
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
  const replaced = new Set(
    shoot.choices
      .filter((one) => parts.some((made) => made.photo === one.photo))
      .map((one) => one.action),
  );
  const others = shoot.choices.filter((one) => !replaced.has(one.action));
  if (!isWorking) {
    return withDone({ ...shoot, choices: others }, parts, instead, now);
  }
  const isInNow = (one: string) =>
    isIn(shoot.photos.find(({ id }) => id === one));
  return {
    ...shoot,
    choices: [
      ...others,
      ...parts.filter((one) => isInNow(one.photo) !== (one.wants === 'in')),
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
