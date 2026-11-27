import { DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { readActivity } from '../../shared/activity.ts';
import { InvalidInput, StoreFailed } from '../../shared/errors/errors.ts';
import { judgeOf } from '../../shared/judge.ts';
import { withChoiceIfFree } from '../../shared/lock.ts';
import { readPublication } from '../../shared/publication.ts';
import { type Standings, standings } from '../../shared/standing.ts';
import {
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeJson,
} from '../../shared/store.ts';
import { withdrawOpen } from './marks.ts';
import { Publishing } from './publishing.ts';
import {
  beforeOf,
  isFinished,
  keepOut,
  putIn,
  undoPutIn,
  verdictOf,
} from './putting-in.ts';
import { Choice, type NewChoice } from './schemas.ts';

// Taking a photo out and putting one in cost nothing, so the page does them
// at once rather than hand them to an agent. Only while a command changes
// the choice or the album, or edits the photo that is to be published, they
// wait, and the page shows them on their way.

const Choices = Schema.Array(Choice);
const idLength = 8;

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use the choices: ${error.message}` });

const readChoices = (files: ShootFiles) =>
  Effect.map(
    readJson(Choices, files.choices),
    Option.getOrElse((): ReadonlyArray<Choice> => []),
  );

const saveChoices = (files: ShootFiles, all: ReadonlyArray<Choice>) =>
  all.length > 0
    ? writeJson(Choices, files.choices, all)
    : Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs
          .remove(files.choices, { force: true })
          .pipe(Effect.mapError(storeFailed));
      });

const isInNow = (known: Standings, photo: string) => {
  const kind = known.of.get(photo)?.kind;
  return kind === 'album' || kind === 'picked';
};

/** Where the photos stand, and which of them go in only with the album. */
type Progress = {
  readonly known: Standings;
  /** Finished photos that are in only once they are in the album. */
  readonly toPublish: ReadonlySet<string>;
};

/** Where the photos of these choices stand, and what they need to be done. */
const progressOf = Effect.fn('progressOf')(function* (
  open: OpenShoot,
  known: Standings,
  choices: ReadonlyArray<Pick<Choice, 'photo' | 'wants'>>,
) {
  const hasAlbum = (yield* readPublication(open)) !== null;
  const comingIn = choices.flatMap(({ photo, wants }) =>
    hasAlbum && wants === 'in' ? [photo] : [],
  );
  const finished = yield* Effect.filter(comingIn, (photo) =>
    isFinished(open, photo),
  );
  return { known, toPublish: new Set(finished) } satisfies Progress;
});

/**
 * Whether what a choice asks for is so: the photo out for the reason the
 * owner gave, or in, and in the album when it is to be published.
 */
const isDone =
  ({ known, toPublish }: Progress) =>
  ({ photo, wants, because }: Choice) => {
    const standing = known.of.get(photo);
    if (wants === 'out') {
      return standing?.kind === 'taken-out' && standing.because === because;
    }
    return (
      standing?.kind === 'album' ||
      (standing?.kind === 'picked' && !toPublish.has(photo))
    );
  };

/** Whether a choice waits: it isn't so yet, and nothing kept it from being done. */
const isWaiting = (progress: Progress) => (choice: Choice) =>
  choice.failed === null && !isDone(progress)(choice);

/**
 * What is still to be done, and what couldn't be, as the page shows it: a
 * choice is on its way until the page has noted all of it.
 */
export const choicesOf = (files: ShootFiles) => readChoices(files);

const invalid = (message: string) => new InvalidInput({ message });

const reasonOf = (because: string | null) =>
  (because?.trim() ?? '') === ''
    ? invalid('Say why the photo goes out.')
    : null;

/** Whether a photo is in, or will be once what waits is done. */
const isInAfter =
  (known: Standings, waiting: ReadonlyArray<Choice>) => (photo: string) => {
    const choice = waiting.find((waits) => waits.photo === photo);
    return choice === undefined ? isInNow(known, photo) : choice.wants === 'in';
  };

const checkPhotos = (open: OpenShoot, { photo, wants, instead }: NewChoice) => {
  if (
    !open.photos.has(photo) ||
    (instead !== null && (!open.photos.has(instead) || instead === photo))
  ) {
    return invalid('The choice is about photos the shoot doesn’t have.');
  }
  return wants === 'out' && instead !== null
    ? invalid('Only a photo that comes in can take the place of another.')
    : null;
};

const checkIn = (
  known: Standings,
  isIn: (photo: string) => boolean,
  { photo, because, instead }: NewChoice,
) => {
  if (isIn(photo)) {
    return invalid('The photo is in already.');
  }
  if (known.of.get(photo)?.kind === 'open' || known.picks === null) {
    return invalid('Photos can be put in once the best ones are chosen.');
  }
  if (verdictOf(known, photo) === undefined) {
    return invalid('The photo wasn’t judged, so it can’t be chosen.');
  }
  if (instead === null) {
    return null;
  }
  return isIn(instead)
    ? reasonOf(because)
    : invalid('The photo it was to take the place of is out already.');
};

/** Refuses what makes no sense for the photos as they are, or will be. */
const check = (
  open: OpenShoot,
  known: Standings,
  waiting: ReadonlyArray<Choice>,
  wanted: NewChoice,
) => {
  const isIn = isInAfter(known, waiting);
  const refused = checkPhotos(open, wanted);
  if (refused !== null || wanted.wants === 'in') {
    return refused ?? checkIn(known, isIn, wanted);
  }
  return isIn(wanted.photo)
    ? reasonOf(wanted.because)
    : invalid('The photo is out already.');
};

/**
 * Notes what the owner chose, in the place of what they chose for those
 * photos before. What is so already, such as a photo put back in before it
 * went out, is forgotten.
 */
export const choose = Effect.fn('choose')(function* (
  open: OpenShoot,
  known: Standings,
  wanted: NewChoice,
) {
  const { files } = open;
  const all = yield* readChoices(files);
  const progress = yield* progressOf(open, known, [...all, wanted]);
  const waiting = all.filter(isWaiting(progress));
  const refused = check(open, known, waiting, wanted);
  if (refused !== null) {
    return yield* refused;
  }
  const action = crypto.randomUUID().replaceAll('-', '').slice(0, idLength);
  const madeAt = DateTime.formatIso(yield* DateTime.now);
  const because = wanted.because?.trim() ?? null;
  const parts: ReadonlyArray<Choice> = [
    {
      action,
      photo: wanted.photo,
      wants: wanted.wants,
      because: wanted.wants === 'out' ? because : null,
      madeAt,
      failed: null,
    },
    ...(wanted.instead === null
      ? []
      : [
          {
            action,
            photo: wanted.instead,
            wants: 'out' as const,
            because,
            madeAt,
            failed: null,
          },
        ]),
  ];
  // A choice about one of these photos goes, with what was chosen with it.
  const replaced = new Set(
    all
      .filter((one) => parts.some(({ photo }) => photo === one.photo))
      .map((one) => one.action),
  );
  yield* saveChoices(files, [
    ...all.filter((one) => !replaced.has(one.action)),
    ...parts.filter(isWaiting(progress)),
  ]);
});

/** Forgets a choice that couldn't be done, once the owner has read why. */
export const dismissChoice = Effect.fn('dismissChoice')(function* (
  files: ShootFiles,
  action: string,
) {
  const all = yield* readChoices(files);
  yield* saveChoices(
    files,
    all.filter((one) => one.action !== action || one.failed === null),
  );
});

/** Why a photo couldn't be done, or null when it was. */
type Outcome = string | null;

const outcomeOf = <E extends { readonly message: string }, R>(
  work: Effect.Effect<void, E, R>,
) =>
  work.pipe(
    Effect.as(null as Outcome),
    Effect.catch((error) => Effect.succeed<Outcome>(error.message)),
  );

/** The choices of one action each. */
const actionsOf = (waiting: ReadonlyArray<Choice>) => [
  ...Map.groupBy(waiting, ({ action }) => action).values(),
];

const insteadFailed =
  'The photo that was to take its place couldn’t be put in.';

const notUndone =
  'It came into the album all the same, and couldn’t be taken back out';

/**
 * Takes a photo out, or keeps it out when it is out already, as a pick may
 * have left it meanwhile. What the owner wanted changed of it goes with it,
 * also when it went out before the page stopped.
 */
const takeOutOne = Effect.fn('takeOutOne')(function* (
  open: OpenShoot,
  known: Standings,
  leaving: Choice,
) {
  const because = leaving.because ?? '';
  const standing = known.of.get(leaving.photo);
  const isOut =
    standing?.kind === 'taken-out' && standing.because === leaving.because;
  if (!isOut && isInNow(known, leaving.photo)) {
    yield* (yield* Publishing).takeOut(open, [leaving.photo], because);
  } else if (!isOut) {
    yield* keepOut(open, leaving.photo, because);
  }
  yield* withdrawOpen(open.files, leaving.photo);
});

/**
 * Does one action, and says for each of its photos why it couldn't be
 * done, or nothing while it has to wait. A photo that was to take the place
 * of one that stays goes back to where it stood.
 */
const doAction = Effect.fn('doAction')(function* (
  open: OpenShoot,
  known: Standings,
  edited: ReadonlySet<string>,
  parts: ReadonlyArray<Choice>,
) {
  const comesIn = parts.find(({ wants }) => wants === 'in');
  const leaving = parts.find(({ wants }) => wants === 'out');
  const outcomes = new Map<string, Outcome>();
  if (comesIn === undefined) {
    if (leaving !== undefined) {
      outcomes.set(
        leaving.photo,
        yield* outcomeOf(takeOutOne(open, known, leaving)),
      );
    }
    return outcomes;
  }
  // Its finished photo may be changing now, so it is published after.
  if (edited.has(comesIn.photo) && (yield* isFinished(open, comesIn.photo))) {
    return outcomes;
  }
  const before = yield* beforeOf(open, comesIn.photo);
  const isIn = yield* outcomeOf(putIn(open, known, comesIn.photo));
  outcomes.set(comesIn.photo, isIn);
  if (leaving === undefined) {
    return outcomes;
  }
  const isOut =
    isIn === null
      ? yield* outcomeOf(takeOutOne(open, known, leaving))
      : insteadFailed;
  outcomes.set(leaving.photo, isOut);
  if (isIn === null && isOut !== null) {
    const undone = yield* outcomeOf(undoPutIn(open, comesIn.photo, before));
    outcomes.set(
      comesIn.photo,
      undone === null ? isOut : `${isOut} ${notUndone}: ${undone}`,
    );
  }
  return outcomes;
});

const doAll = Effect.fn('doAll')(function* (open: OpenShoot) {
  const { files } = open;
  const model = yield* judgeOf(open, Option.none());
  const known = yield* standings(open, model);
  const all = yield* readChoices(files);
  const edited = new Set((yield* readActivity(files))?.photos ?? []);
  const outcomes = new Map<string, Outcome>();
  // Each is done again until it is noted as done, which finishes what the
  // page did of it before it stopped.
  for (const parts of actionsOf(all.filter(({ failed }) => failed === null))) {
    for (const [photo, outcome] of yield* doAction(
      open,
      known,
      edited,
      parts,
    )) {
      outcomes.set(photo, outcome);
    }
  }
  const left = all.flatMap((one) => {
    const outcome = outcomes.get(one.photo);
    if (outcome === undefined) {
      return [one];
    }
    return outcome === null ? [] : [{ ...one, failed: outcome }];
  });
  yield* saveChoices(files, left);
  return left.some(({ failed }) => failed === null);
});

/**
 * Does what the owner chose, unless a command changes the choice or the
 * album now. Says whether something still waits for that.
 */
export const settle = (open: OpenShoot) =>
  doAll(open).pipe(
    withChoiceIfFree(open.files),
    Effect.map(Option.getOrElse(() => true)),
  );
