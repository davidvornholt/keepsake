import { Deferred, Effect, Ref } from 'effect';

/** Wakes whoever waits for something to change, each time it changes. */
export const makeSignal = Effect.gen(function* () {
  const next = yield* Ref.make(yield* Deferred.make<void>());
  return {
    /** Done at the next change. Take it before looking, so none is missed. */
    next: Ref.get(next),
    changed: Effect.flatMap(Deferred.make<void>(), (fresh) =>
      Effect.flatMap(Ref.getAndSet(next, fresh), (old) =>
        Deferred.succeed(old, undefined),
      ),
    ),
  };
});

export type Signal = Effect.Success<typeof makeSignal>;
