// What the owner is told about a mark, from what keepsake found while it acted
// on it, without asking a model for the words.

export const takenOut =
  'You took the photo out, so it wasn’t changed and isn’t in the album.';

export const noMoney =
  'What you agreed to pay was used up before this change, so the photo stays as it was. Mark it again to hand it over with more.';

const nothingPassed =
  'No version of the change passed the review, so the photo stays as it was.';

/** What `edit` printed about one photo. */
export type EditedPhoto = {
  /** Whether its finished photo is another one now. */
  readonly changed: boolean;
  /** What the owner wanted. */
  readonly wish: string;
  /**
   * What the edit it has now says of itself, if it has one: a change of
   * single places says what changed there.
   */
  readonly review: string | null;
  /** Why the camera's own picture was kept, when it was. */
  readonly keptBecause: string | null;
  readonly notDone: ReadonlyArray<string>;
};

const changedPrefix = 'Changed:';

const ending = /[.!?…]$/u;

const sentence = (text: string) => {
  const trimmed = text.trim();
  return ending.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** The answer to a mark, once its edit ended. */
export const answerFor = ({
  changed,
  wish,
  review,
  keptBecause,
  notDone,
}: EditedPhoto): {
  readonly changed: boolean;
  readonly note: string;
} => {
  if (!changed || keptBecause !== null) {
    const reasons =
      notDone.length > 0 ? notDone : [keptBecause ?? nothingPassed];
    return { changed: false, note: reasons.map(sentence).join(' ') };
  }
  // A change of single places says what changed; an edit anew says how good
  // its version is, which isn't what the owner asked about.
  const said =
    review?.startsWith(changedPrefix) === true
      ? review
      : `${changedPrefix} ${sentence(wish)}`;
  const rest = notDone.filter((what) => !said.includes(what));
  return {
    changed: true,
    note: [
      sentence(said),
      ...rest.map((what) => `Not done: ${sentence(what)}`),
    ].join(' '),
  };
};
