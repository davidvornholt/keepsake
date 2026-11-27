import { Effect, Option } from 'effect';
import { EditRecord } from '../../shared/domain.ts';
import { digestOf, readJson, type ShootFiles } from '../../shared/store.ts';
import type { Called } from './calls.ts';
import {
  answered,
  forgetOperation,
  handOverOf,
  notDone,
  type Step,
  standingsOf,
  stopped,
  versionOf,
} from './carry-out.ts';
import { type Carrying, type Progress, saveCarrying } from './carrying.ts';
import { isStillChosen } from './hand-over.ts';
import { answerFor, changeUsedUp, takenOut } from './mark-answers.ts';
import { editOrder, publishOrder } from './order-steps.ts';
import type { Mark } from './schemas.ts';
import {
  busyFor,
  current,
  type Doing,
  editedIn,
  isBusy,
} from './step-outputs.ts';

// Carries out one step with a keepsake command, and notes what came of it.

const changedButOut =
  'It was changed, but you took the photo out meanwhile, so it isn’t in the album.';

const changedSince =
  'The photo was edited again after this change was made, so it isn’t put into the album. Go on to make the change again.';

/** Whether a photo's finished file is still the one an edit left. */
const isStill = (
  files: ShootFiles,
  { photo, digest }: { readonly photo: string; readonly digest: string },
) =>
  digestOf(files.edit(photo).final).pipe(
    Effect.map((now) => now === digest),
    Effect.orElseSucceed(() => false),
  );

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
    const made = edited.finished?.find((one) => one.photo === photo);
    if (made !== undefined && !(yield* isStill(files, made))) {
      // Another edit came after it, so it isn't what the owner agreed to.
      yield* markStopped(files, carrying, mark, {
        reason: changedSince,
        needs: 'retry',
      });
      return yield* forgetOperation(files, operation);
    }
    const after = yield* versionOf(files, photo);
    const record = Option.getOrNull(
      yield* readJson(EditRecord, files.edit(photo).record),
    );
    const answer = answerFor({
      changed:
        after !== null && after !== (carrying.marks[mark.id]?.before ?? null),
      wish: mark.note,
      review: made?.review ?? record?.review ?? null,
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
