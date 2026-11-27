import { Effect, Schema } from 'effect';
import { openShoot } from '../../shared/store.ts';
import type { Called } from './calls.ts';
import {
  type Step,
  standingsOf,
  stillOrdered,
  stopped,
  usedUp,
} from './carry-out.ts';
import { type Carrying, saveCarrying } from './carrying.ts';
import { isEdited } from './hand-over.ts';
import { noteAdded } from './news.ts';
import {
  busyFor,
  current,
  type Doing,
  type Edited,
  editedIn,
  isBusy,
} from './step-outputs.ts';

// Carries out an order's steps: its photos edited, and put into the album.

/** What `publish --order` printed: the photos it put into the album. */
const Published = Schema.fromJsonString(
  Schema.Struct({ photos: Schema.Array(Schema.String) }),
);

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

/** Puts what of an order is edited into the album, if any is. */
export const publishOrder = Effect.fn('publishOrder')(function* (
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
export const editOrder = Effect.fn('editOrder')(function* (
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
