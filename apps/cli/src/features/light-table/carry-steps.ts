import { Effect, Option, Schema, type Semaphore } from 'effect';
import { EditRecord } from '../../shared/domain.ts';
import { openShoot, readJson } from '../../shared/store.ts';
import type { Called, Caller } from './calls.ts';
import {
  answered,
  notDone,
  type Step,
  standingsOf,
  stopped,
  usedUp,
  versionOf,
  waitingOf,
} from './carry-out.ts';
import { type Carrying, readCarrying, saveCarrying } from './carrying.ts';
import { isEdited, isStillChosen } from './hand-over.ts';
import { readHandOvers } from './handed.ts';
import { answerFor, noMoney, takenOut } from './mark-answers.ts';
import { noteAdded } from './news.ts';
import type { Mark } from './schemas.ts';

// Carries out one step with a keepsake command, and notes what came of it.

const Edited = Schema.fromJsonString(
  Schema.Struct({
    keptFromCamera: Schema.Array(
      Schema.Struct({ photo: Schema.String, reason: Schema.String }),
    ),
    notDone: Schema.Array(
      Schema.Struct({ photo: Schema.String, what: Schema.String }),
    ),
    overBudget: Schema.Array(Schema.String),
    failed: Schema.Array(
      Schema.Struct({ photo: Schema.String, reason: Schema.String }),
    ),
  }),
);
type Edited = typeof Edited.Type;

const changedButOut =
  'It was changed, but you took the photo out meanwhile, so it isn’t in the album.';

/** How long to wait while another command works on the shoot. */
const busyFor = '2 seconds';

type Doing = {
  readonly call: Caller;
  /** Held while the page changes something, so nothing changes in between. */
  readonly writing: Semaphore.Semaphore;
};

/** What a command printed, or why it failed in a way that stops it. */
const editedIn = (called: Called) =>
  called.kind === 'failed'
    ? Effect.succeed<Edited | string>(called.message)
    : Schema.decodeUnknownEffect(Edited)(called.output.trim()).pipe(
        Effect.orElseSucceed(
          () => 'keepsake edit printed something unexpected.',
        ),
      );

/** What is noted about the shoot now, unless another server took it over. */
const current = Effect.fn('current')(function* (name: string) {
  const open = yield* openShoot(name);
  const carrying = yield* readCarrying(open.files);
  return carrying === null ? null : { open, carrying };
});

const recordMarkEdit = Effect.fn('recordMarkEdit')(function* (
  name: string,
  mark: Mark,
  called: Called,
) {
  const found = yield* current(name);
  if (found === null) {
    return;
  }
  const { open, carrying } = found;
  const { files } = open;
  const edited = yield* editedIn(called);
  if (typeof edited === 'string') {
    // `edit --mark` reads the album first, so this knows of a photo taken out.
    const known = yield* standingsOf(open);
    yield* isStillChosen(known)(mark)
      ? stopped(files, carrying, {
          reason: `Changing the photo failed: ${edited}`,
          needs: 'retry',
          handOver: (yield* handOverOf(files, mark)) ?? '',
          photos: [mark.photo],
        })
      : answered(files, carrying, mark, notDone(takenOut));
    return;
  }
  const { photo } = mark;
  if (edited.overBudget.includes(photo)) {
    yield* answered(files, carrying, mark, notDone(noMoney));
    return;
  }
  const failed = edited.failed.find((one) => one.photo === photo);
  if (failed !== undefined) {
    yield* stopped(files, carrying, {
      reason: `Changing the photo failed: ${failed.reason}`,
      needs: 'retry',
      handOver: (yield* handOverOf(files, mark)) ?? '',
      photos: [photo],
    });
    return;
  }
  const progress = carrying.marks[mark.id];
  const after = yield* versionOf(files, photo);
  const record = Option.getOrNull(
    yield* readJson(EditRecord, files.edit(photo).record),
  );
  const answer = answerFor({
    changed: after !== null && after !== (progress?.before ?? null),
    wish: mark.note,
    review: record?.review ?? null,
    keptBecause:
      edited.keptFromCamera.find((one) => one.photo === photo)?.reason ?? null,
    notDone: edited.notDone.flatMap((one) =>
      one.photo === photo ? [one.what] : [],
    ),
  });
  yield* saveCarrying(files, {
    ...carrying,
    marks: {
      ...carrying.marks,
      [mark.id]: {
        before: progress?.before ?? null,
        edited: answer,
        published: false,
      },
    },
  });
});

/** The hand-over a mark came with. */
const handOverOf = (files: Parameters<typeof readHandOvers>[0], mark: Mark) =>
  Effect.map(
    readHandOvers(files),
    (records) => records.find(({ marks }) => marks.includes(mark.id))?.id,
  );

const recordMarkPublish = Effect.fn('recordMarkPublish')(function* (
  name: string,
  mark: Mark,
  called: Called,
) {
  const found = yield* current(name);
  if (found === null) {
    return;
  }
  const { open, carrying } = found;
  const { files } = open;
  const progress = carrying.marks[mark.id];
  if (called.kind === 'failed') {
    const known = yield* standingsOf(open);
    yield* isStillChosen(known)(mark)
      ? stopped(files, carrying, {
          reason: `Putting the changed photo into the album failed: ${called.message}`,
          needs: 'retry',
          handOver: (yield* handOverOf(files, mark)) ?? '',
          photos: [mark.photo],
        })
      : answered(files, carrying, mark, notDone(changedButOut));
    return;
  }
  if (progress !== undefined) {
    yield* saveCarrying(files, {
      ...carrying,
      toExplain: true,
      marks: { ...carrying.marks, [mark.id]: { ...progress, published: true } },
    });
  }
});

/**
 * Notes which of an order's photos are in the album now, and stops when
 * some aren't although they should be.
 */
const recordOrderPublish = Effect.fn('recordOrderPublish')(function* (
  name: string,
  handOver: string,
  photos: ReadonlyArray<string>,
  called: Called,
) {
  const found = yield* current(name);
  if (found === null) {
    return;
  }
  const { open, carrying } = found;
  const { files } = open;
  if (called.kind === 'failed') {
    yield* stopped(files, carrying, {
      reason: `Putting the photos you ordered into the album failed: ${called.message}`,
      needs: 'retry',
      handOver,
      photos,
    });
    return;
  }
  const known = yield* standingsOf(open);
  yield* noteAdded(
    files,
    photos.filter((photo) => known.of.get(photo)?.kind === 'album'),
  );
  const left = photos.filter((photo) => known.of.get(photo)?.kind === 'picked');
  const going: Carrying = { ...carrying, toExplain: true };
  yield* left.length === 0
    ? saveCarrying(files, going)
    : stopped(files, going, {
        reason: `${left.length === 1 ? 'One photo you ordered didn’t' : `${left.length} photos you ordered didn’t`} go into the album.`,
        needs: 'retry',
        handOver,
        photos: left,
      });
});

/** The photos of an order that are edited and still to be published. */
const editedWaiting = Effect.fn('editedWaiting')(function* (
  name: string,
  handOver: string,
) {
  const open = yield* openShoot(name);
  const order = (yield* readHandOvers(open.files)).find(
    ({ id }) => id === handOver,
  );
  if (order === undefined) {
    return [];
  }
  return yield* Effect.filter(
    waitingOf(yield* standingsOf(open), order),
    (photo) => isEdited(open.files, photo),
  );
});

const isBusy = (called: Called) =>
  called.kind === 'failed' && called.tag === 'ShootBusy';

/** Edits an order's photos, and puts what is done into the album when some stop. */
const editOrder = Effect.fn('editOrder')(function* (
  name: string,
  step: Extract<Step, { readonly kind: 'editOrder' }>,
  { call, writing }: Doing,
) {
  const { handOver, photos, budget } = step;
  const called = yield* call([
    'edit',
    name,
    ...photos,
    '--budget',
    `${budget}`,
  ]);
  if (isBusy(called)) {
    return yield* Effect.sleep(busyFor);
  }
  const edited = yield* editedIn(called);
  const short = typeof edited === 'string' ? [] : edited.overBudget;
  const failed = typeof edited === 'string' ? [] : edited.failed;
  const unedited = yield* Effect.filter(photos, (photo) =>
    Effect.flatMap(openShoot(name), (open) =>
      Effect.map(isEdited(open.files, photo), (is) => !is),
    ),
  );
  if (typeof edited !== 'string' && unedited.length === 0) {
    return;
  }
  // What was edited goes into the album before the owner is asked.
  const done = yield* writing.withPermits(1)(editedWaiting(name, handOver));
  const published =
    done.length > 0 ? yield* call(['publish', name, ...done]) : null;
  yield* writing.withPermits(1)(
    Effect.gen(function* () {
      if (published !== null && published.kind === 'done') {
        yield* recordOrderPublish(name, handOver, done, published);
      }
      const found = yield* current(name);
      if (found === null) {
        return;
      }
      const { files } = found.open;
      const reason =
        typeof edited === 'string' ? edited : (failed[0]?.reason ?? null);
      yield* stopped(
        files,
        found.carrying,
        short.length > 0 && typeof edited !== 'string'
          ? {
              reason: usedUp(short.length),
              needs: 'money',
              handOver,
              photos: short,
            }
          : {
              reason:
                reason === null
                  ? `keepsake didn’t edit ${unedited.join(', ')}.`
                  : `Editing a photo you ordered failed: ${reason}`,
              needs: 'retry',
              handOver,
              photos: unedited,
            },
      );
    }),
  );
});

/** Carries out a step that needs a keepsake command. */
export const act = Effect.fn('act')(function* (
  name: string,
  step: Step,
  doing: Doing,
) {
  const { call, writing } = doing;
  const noting = writing.withPermits(1);
  switch (step.kind) {
    case 'editMark': {
      const { mark, budget } = step;
      const called = yield* call([
        'edit',
        name,
        '--mark',
        mark.id,
        '--budget',
        `${budget}`,
      ]);
      return yield* isBusy(called)
        ? Effect.sleep(busyFor)
        : noting(recordMarkEdit(name, mark, called));
    }
    case 'publishMark': {
      const called = yield* call(['publish', name, '--mark', step.mark.id]);
      return yield* isBusy(called)
        ? Effect.sleep(busyFor)
        : noting(recordMarkPublish(name, step.mark, called));
    }
    case 'editOrder':
      return yield* editOrder(name, step, doing);
    case 'publishOrder': {
      const { handOver, photos } = step;
      const called = yield* call(['publish', name, ...photos]);
      return yield* isBusy(called)
        ? Effect.sleep(busyFor)
        : noting(recordOrderPublish(name, handOver, photos, called));
    }
    case 'explain': {
      // What it explains only says why photos aren't in the album, so one
      // that fails stops nothing.
      const called = yield* call(['explain', name]);
      return yield* isBusy(called)
        ? Effect.sleep(busyFor)
        : noting(
            Effect.gen(function* () {
              const found = yield* current(name);
              if (found !== null) {
                yield* saveCarrying(found.open.files, {
                  ...found.carrying,
                  toExplain: false,
                });
              }
            }),
          );
    }
    default:
  }
});
