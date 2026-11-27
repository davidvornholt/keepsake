import { Effect, Option, Schema, type Semaphore } from 'effect';
import { EditRecord } from '../../shared/domain.ts';
import { openShoot, readJson, type ShootFiles } from '../../shared/store.ts';
import type { Called, Caller } from './calls.ts';
import {
  answered,
  forgetOperation,
  handOverOf,
  notDone,
  type Step,
  standingsOf,
  stillOrdered,
  stopped,
  usedUp,
  versionOf,
} from './carry-out.ts';
import {
  type Carrying,
  type Progress,
  readCarrying,
  saveCarrying,
} from './carrying.ts';
import { isEdited, isStillChosen } from './hand-over.ts';
import { answerFor, changeUsedUp, takenOut } from './mark-answers.ts';
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

/** What `publish --order` printed: the photos it put into the album. */
const Published = Schema.fromJsonString(
  Schema.Struct({ photos: Schema.Array(Schema.String) }),
);

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

/** What is noted about the shoot now. */
const current = Effect.fn('current')(function* (name: string) {
  const open = yield* openShoot(name);
  const carrying = yield* readCarrying(open.files);
  return carrying === null ? null : { open, carrying };
});

/**
 * The shoot as noted with what came of a mark's edit, which is no more to be
 * read under its operation: another attempt is another edit.
 */
const withEdit = (
  carrying: Carrying,
  mark: Mark,
  edited: Progress['edited'],
): Carrying => ({
  ...carrying,
  marks: {
    ...carrying.marks,
    [mark.id]: {
      operation: null,
      before: carrying.marks[mark.id]?.before ?? null,
      edited,
      published: false,
    },
  },
});

/** Stops a mark's change for the owner's word, to try it again as a new edit. */
const markStopped = (
  files: ShootFiles,
  carrying: Carrying,
  mark: Mark,
  {
    reason,
    needs,
  }: { readonly reason: string; readonly needs: 'money' | 'retry' },
) =>
  Effect.gen(function* () {
    yield* stopped(files, withEdit(carrying, mark, null), {
      reason,
      needs,
      handOver: yield* handOverOf(files, mark),
      photos: [mark.photo],
    });
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
  const operation = carrying.marks[mark.id]?.operation;
  const edited = yield* editedIn(called);
  const { photo } = mark;
  const failed =
    typeof edited === 'string'
      ? edited
      : edited.failed.find((one) => one.photo === photo)?.reason;
  if (failed !== undefined) {
    // `edit --mark` reads the album first, so this knows of a photo taken out.
    const known = yield* standingsOf(open);
    yield* isStillChosen(known)(mark)
      ? markStopped(files, carrying, mark, {
          reason: `Changing the photo failed: ${failed}`,
          needs: 'retry',
        })
      : answered(files, carrying, mark, notDone(takenOut));
  } else if (typeof edited !== 'string' && edited.overBudget.includes(photo)) {
    // Still to be made with its wish, once the owner pays more.
    yield* markStopped(files, carrying, mark, {
      reason: changeUsedUp,
      needs: 'money',
    });
  } else if (typeof edited !== 'string') {
    const after = yield* versionOf(files, photo);
    const record = Option.getOrNull(
      yield* readJson(EditRecord, files.edit(photo).record),
    );
    const answer = answerFor({
      changed:
        after !== null && after !== (carrying.marks[mark.id]?.before ?? null),
      wish: mark.note,
      review: record?.review ?? null,
      keptBecause:
        edited.keptFromCamera.find((one) => one.photo === photo)?.reason ??
        null,
      notDone: edited.notDone.flatMap((one) =>
        one.photo === photo ? [one.what] : [],
      ),
    });
    yield* saveCarrying(files, withEdit(carrying, mark, answer));
  }
  yield* forgetOperation(files, operation);
});

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
          handOver: yield* handOverOf(files, mark),
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
 * Notes which of an order's photos `publish --order` put into the album, and
 * stops when it failed.
 */
const recordOrderPublish = Effect.fn('recordOrderPublish')(function* (
  name: string,
  handOver: string,
  called: Called,
) {
  const found = yield* current(name);
  if (found === null) {
    return;
  }
  const { open, carrying } = found;
  const { files } = open;
  const published =
    called.kind === 'failed'
      ? called.message
      : yield* Schema.decodeUnknownEffect(Published)(called.output.trim()).pipe(
          Effect.orElseSucceed(
            () => 'keepsake publish printed something unexpected.',
          ),
        );
  if (typeof published === 'string') {
    yield* stopped(files, carrying, {
      reason: `Putting the photos you ordered into the album failed: ${published}`,
      needs: 'retry',
      handOver,
      photos: yield* stillOrdered(open, handOver),
    });
    return;
  }
  const known = yield* standingsOf(open);
  yield* noteAdded(
    files,
    published.photos.filter((photo) => known.of.get(photo)?.kind === 'album'),
  );
  const left = published.photos.filter(
    (photo) => known.of.get(photo)?.kind === 'picked',
  );
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

const isBusy = (called: Called) =>
  called.kind === 'failed' && called.tag === 'ShootBusy';

/** Puts what of an order is edited into the album, if any is. */
const publishOrder = Effect.fn('publishOrder')(function* (
  name: string,
  handOver: string,
  { call, writing }: Doing,
) {
  const isAny = yield* writing.withPermits(1)(
    Effect.flatMap(openShoot(name), (open) =>
      Effect.map(stillOrdered(open, handOver), (photos) => photos.length > 0),
    ),
  );
  if (!isAny) {
    return;
  }
  // `publish` itself finds which are still chosen when it starts, under the
  // choice lock, so none the owner took out comes back.
  const called = yield* call(['publish', name, '--order', handOver]);
  if (isBusy(called)) {
    return yield* Effect.sleep(busyFor);
  }
  yield* writing.withPermits(1)(recordOrderPublish(name, handOver, called));
});

/** Why an order's edit stopped, for the owner. */
const orderStop = (
  edited: Edited | string,
  unedited: ReadonlyArray<string>,
) => {
  if (typeof edited !== 'string' && edited.overBudget.length > 0) {
    return {
      reason: usedUp(edited.overBudget.length),
      needs: 'money' as const,
      photos: edited.overBudget,
    };
  }
  const reason =
    typeof edited === 'string' ? edited : (edited.failed[0]?.reason ?? null);
  return {
    reason:
      reason === null
        ? `keepsake didn’t edit ${unedited.join(', ')}.`
        : `Editing a photo you ordered failed: ${reason}`,
    needs: 'retry' as const,
    photos: unedited,
  };
};

/** Edits an order's photos, and puts what is done into the album when some stop. */
const editOrder = Effect.fn('editOrder')(function* (
  name: string,
  step: Extract<Step, { readonly kind: 'editOrder' }>,
  doing: Doing,
) {
  const { call, writing } = doing;
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
  const unedited = yield* Effect.filter(photos, (photo) =>
    Effect.flatMap(openShoot(name), (open) =>
      Effect.map(isEdited(open.files, photo), (is) => !is),
    ),
  );
  if (typeof edited !== 'string' && unedited.length === 0) {
    return;
  }
  // What was edited goes into the album before the owner is asked.
  yield* publishOrder(name, handOver, doing);
  yield* writing.withPermits(1)(
    Effect.gen(function* () {
      const found = yield* current(name);
      if (found !== null) {
        yield* stopped(found.open.files, found.carrying, {
          ...orderStop(edited, unedited),
          handOver,
        });
      }
    }),
  );
});

/** Notes that `explain` ran, which stops nothing when it failed. */
const explained = (name: string) =>
  Effect.gen(function* () {
    const found = yield* current(name);
    if (found !== null) {
      yield* saveCarrying(found.open.files, {
        ...found.carrying,
        toExplain: false,
      });
    }
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
      const { mark, budget, operation } = step;
      const called = yield* call([
        'edit',
        name,
        '--mark',
        mark.id,
        '--budget',
        `${budget}`,
        '--operation',
        operation,
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
    case 'publishOrder':
      return yield* publishOrder(name, step.handOver, doing);
    case 'explain': {
      const called = yield* call(['explain', name]);
      return yield* isBusy(called)
        ? Effect.sleep(busyFor)
        : noting(explained(name));
    }
    default:
  }
});
