import { Effect, Option, Ref, Schema, Semaphore } from 'effect';
import { Reason } from '../../shared/domain.ts';
import {
  type ModelFailed,
  StepMissing,
  type ToolFailed,
} from '../../shared/errors/errors.ts';
import { judgeOf } from '../../shared/judge.ts';
import { inSteps } from '../../shared/progress.ts';
import { readReasons, standings } from '../../shared/standing.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';
import { behind, whyBehind } from './behind.ts';
import { batchesOf, leftOut, whyLeftOut } from './left-out.ts';

const concurrency = 6;

const Reasons = Schema.Array(Reason);

/** Adds reasons to those of the shoot as they are found. */
const makeReasons = Effect.fn('makeReasons')(function* (open: OpenShoot) {
  const all = yield* Ref.make(yield* readReasons(open));
  const writing = yield* Semaphore.make(1);
  return Effect.fn('addReasons')(function* (found: ReadonlyArray<Reason>) {
    const isNew = new Set(found.map(({ photo }) => photo));
    yield* writing.withPermits(1)(
      Effect.gen(function* () {
        const reasons = yield* Ref.updateAndGet(all, (before) => [
          ...before.filter(({ photo }) => !isNew.has(photo)),
          ...found,
        ]);
        yield* writeJson(Reasons, open.files.reasons, reasons);
      }),
    );
  });
});
type AddReasons = Effect.Success<ReturnType<typeof makeReasons>>;

/** Asks about several things, and notes every answer. */
const asking = Effect.fn('asking')(function* <A, R>(
  add: AddReasons,
  asked: ReadonlyArray<A>,
  ask: (
    one: A,
  ) => Effect.Effect<ReadonlyArray<Reason>, ModelFailed | ToolFailed, R>,
) {
  return yield* inSteps('explain', asked, concurrency, (one) =>
    ask(one).pipe(
      Effect.tap(add),
      Effect.map((reasons) => ({
        reasons,
        failed: null as string | null,
      })),
      // One question that fails doesn't lose the answers to the others.
      Effect.catchTag('ModelFailed', ({ message }) =>
        Effect.succeed({ reasons: [], failed: message }),
      ),
    ),
  );
});

/** Finds out why photos of the shoot aren't in the album. */
export const explain = Effect.fn('explain')(function* (
  open: OpenShoot,
  again: boolean,
) {
  const { name } = open.shoot;
  const judge = yield* judgeOf(open, Option.none());
  const known = yield* standings(open, judge);
  if (known.picks === null) {
    return yield* new StepMissing({
      message: `No photos of ${name} are picked yet. Run \`keepsake pick ${name}\` first.`,
    });
  }
  const photos = [...open.photos.values()];
  const add = yield* makeReasons(open);
  const single = leftOut(known, photos, again);
  const first = yield* asking(add, batchesOf(known, single, photos), (batch) =>
    whyLeftOut(open, batch),
  );
  // The answers may have said that some stand behind others.
  const groups = behind(yield* standings(open, judge), photos, again);
  const second = yield* asking(add, groups, (group) => whyBehind(open, group));
  const found = [...first, ...second].flatMap(({ reasons }) => reasons);
  const explained = new Set(found.map(({ photo }) => photo));
  const asked = [
    ...single.map(({ id }) => id),
    ...groups.flatMap((group) => group.asked),
  ];
  return {
    shoot: name,
    explained: explained.size,
    similar: found.filter(({ repeats }) => repeats !== null).length,
    notExplained: asked.filter((photo) => !explained.has(photo)),
    failed: [
      ...new Set([...first, ...second].flatMap(({ failed }) => failed ?? [])),
    ],
  };
});
