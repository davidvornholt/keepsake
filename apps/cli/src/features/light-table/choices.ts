import { Context, DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { readActivity } from '../../shared/activity.ts';
import { PickList, Removed } from '../../shared/domain.ts';
import { InvalidInput, StoreFailed } from '../../shared/errors/errors.ts';
import { judgeOf } from '../../shared/judge.ts';
import { withAlbum, withChoiceIfFree } from '../../shared/lock.ts';
import { readPublication } from '../../shared/publication.ts';
import {
  isOutOf,
  readAllRemoved,
  type Standings,
  standings,
} from '../../shared/standing.ts';
import {
  exists,
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeJson,
} from '../../shared/store.ts';
import { pickOf } from '../../shared/verdicts.ts';
import { Choice, type NewChoice } from './schemas.ts';

// Taking a photo out and putting one in cost nothing, so the page does them
// at once rather than hand them to an agent. Only while a command changes
// the choice or the album, or edits the photo that is to be published, they
// wait, and the page shows them on their way.

/**
 * What takes photos out of the album and publishes them, which is the
 * publish feature's work. The entrypoint gives it to the page.
 */
export class Publishing extends Context.Service<
  Publishing,
  {
    readonly takeOut: (
      open: OpenShoot,
      photos: ReadonlyArray<string>,
      because: string,
    ) => Effect.Effect<void, { readonly message: string }>;
    readonly publish: (
      open: OpenShoot,
      photos: ReadonlyArray<string>,
    ) => Effect.Effect<void, { readonly message: string }>;
  }
>()('@keepsake/cli/features/light-table/Publishing') {}

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

/** Whether a choice waits: it isn't so yet, and nothing kept it from being done. */
const isWaiting = (known: Standings) => (choice: Choice) =>
  choice.failed === null &&
  isInNow(known, choice.photo) !== (choice.wants === 'in');

/** What is still to be done, and what couldn't be, as the page shows it. */
export const choicesOf = Effect.fn('choicesOf')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const waits = isWaiting(known);
  return (yield* readChoices(files)).filter(
    (choice) => choice.failed !== null || waits(choice),
  );
});

const invalid = (message: string) => new InvalidInput({ message });

const reasonOf = (because: string | null) =>
  (because?.trim() ?? '') === ''
    ? invalid('Say why the photo goes out.')
    : null;

/** The verdict on the moment of a photo, which a photo needs to be chosen. */
const verdictOf = (known: Standings, photo: string) =>
  [...known.verdicts.values()].find(({ photos }) => photos.includes(photo));

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
  const waiting = all.filter(isWaiting(known));
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
    ...parts.filter(isWaiting(known)),
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

/** Lets a photo out of the album count again for it, where it was taken out. */
const bringBack = (open: OpenShoot, photo: string) =>
  Effect.gen(function* () {
    const album = (yield* readPublication(open))?.albumId;
    const all = yield* readAllRemoved(open, album);
    const isOut = (one: Removed) => one.photo === photo && isOutOf(album)(one);
    if (all.some(isOut)) {
      yield* writeJson(
        Schema.Array(Removed),
        open.files.removed,
        all.filter((one) => !isOut(one)),
      );
    }
  }).pipe(withAlbum(open.files));

/** Makes a photo one of the chosen, if it isn't. */
const pickPhoto = Effect.fn('pickPhoto')(function* (
  open: OpenShoot,
  known: Standings,
  photo: string,
) {
  const list = Option.getOrNull(yield* readJson(PickList, open.files.picks));
  const verdict = verdictOf(known, photo);
  if (list === null || verdict === undefined) {
    return yield* invalid('Nothing is chosen yet, so it can’t be chosen.');
  }
  if (!list.picks.some((one) => one.photo === photo)) {
    yield* writeJson(PickList, open.files.picks, {
      ...list,
      picks: [...list.picks, pickOf(verdict, photo)],
    });
  }
});

const isFinished = (open: OpenShoot, photo: string) =>
  Effect.gen(function* () {
    const files = open.files.edit(photo);
    return (yield* exists(files.record)) && (yield* exists(files.final));
  });

/**
 * Chooses a photo, and publishes it when it is finished and there is an
 * album, so that it comes back into the album as it was or goes into it for
 * the first time. Without an album it waits for the owner to order one.
 */
const putIn = Effect.fn('putIn')(function* (
  open: OpenShoot,
  known: Standings,
  photo: string,
) {
  yield* bringBack(open, photo);
  yield* pickPhoto(open, known, photo);
  const hasAlbum = (yield* readPublication(open)) !== null;
  if (hasAlbum && (yield* isFinished(open, photo))) {
    yield* (yield* Publishing).publish(open, [photo]);
  }
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

/** The choices of one action each: the photo that comes in first. */
const actionsOf = (waiting: ReadonlyArray<Choice>) =>
  [...Map.groupBy(waiting, ({ action }) => action).values()].map((parts) =>
    parts.toSorted(
      (left, right) =>
        Number(right.wants === 'in') - Number(left.wants === 'in'),
    ),
  );

const insteadFailed =
  'The photo that was to take its place couldn’t be put in.';

/**
 * Does one action, and says for each of its photos why it couldn't be
 * done, or nothing while it has to wait.
 */
const doAction = Effect.fn('doAction')(function* (
  open: OpenShoot,
  known: Standings,
  edited: ReadonlySet<string>,
  parts: ReadonlyArray<Choice>,
) {
  const [first] = parts;
  const comesIn = first?.wants === 'in' ? first : undefined;
  const outcomes = new Map<string, Outcome>();
  if (comesIn !== undefined) {
    // Its finished photo may be changing now, so it is published after.
    if (edited.has(comesIn.photo) && (yield* isFinished(open, comesIn.photo))) {
      return outcomes;
    }
    outcomes.set(
      comesIn.photo,
      yield* outcomeOf(putIn(open, known, comesIn.photo)),
    );
  }
  const isIn = comesIn === undefined ? null : outcomes.get(comesIn.photo);
  const publishing = yield* Publishing;
  for (const leaving of parts.filter(({ wants }) => wants === 'out')) {
    outcomes.set(
      leaving.photo,
      isIn === null
        ? yield* outcomeOf(
            publishing.takeOut(open, [leaving.photo], leaving.because ?? ''),
          )
        : insteadFailed,
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
  for (const parts of actionsOf(all.filter(isWaiting(known)))) {
    for (const [photo, outcome] of yield* doAction(
      open,
      known,
      edited,
      parts,
    )) {
      outcomes.set(photo, outcome);
    }
  }
  const after = yield* standings(open, model);
  const left = all
    .flatMap((one) => {
      const outcome = outcomes.get(one.photo);
      if (outcome === undefined) {
        return [one];
      }
      return outcome === null ? [] : [{ ...one, failed: outcome }];
    })
    .filter((one) => one.failed !== null || isWaiting(after)(one));
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
