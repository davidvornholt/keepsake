import { Clock, Console, Effect, Ref } from 'effect';

/** Progress is told at most this often, in milliseconds. */
const interval = 2000;

const tell = (step: string, done: number, total: number) =>
  Console.error(JSON.stringify({ progress: { step, done, total } }));

/**
 * Runs every item, several at once, and tells on stderr as a JSON line how
 * far the step is.
 */
export const inSteps = Effect.fn('inSteps')(function* <A, B, E, R>(
  step: string,
  items: ReadonlyArray<A>,
  concurrency: number,
  run: (item: A) => Effect.Effect<B, E, R>,
) {
  const total = items.length;
  const state = yield* Ref.make({ done: 0, told: 0 });
  const advance = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const done = yield* Ref.modify(state, (before) => {
      const next = before.done + 1;
      return now - before.told >= interval || next === total
        ? [next, { done: next, told: now }]
        : [undefined, { done: next, told: before.told }];
    });
    if (done !== undefined) {
      yield* tell(step, done, total);
    }
  });
  return yield* Effect.forEach(
    items,
    (item) => run(item).pipe(Effect.tap(advance)),
    { concurrency },
  );
});
