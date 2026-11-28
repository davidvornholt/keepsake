import { describe, expect, it } from 'bun:test';
import { Deferred, Effect, Fiber, Option, Ref } from 'effect';
import { Spending } from '../../shared/spending.ts';
import { makeBudget } from './edit.ts';

/** A budget with `left` dollars, whose next look at them waits for `held`. */
const spendingWith = (
  left: Ref.Ref<number>,
  held: Ref.Ref<Deferred.Deferred<void> | null>,
) =>
  Spending.of({
    left: Effect.gen(function* () {
      const dollars = yield* Ref.get(left);
      const wait = yield* Ref.getAndSet(held, null);
      if (wait !== null) {
        yield* Deferred.await(wait);
      }
      return dollars;
    }),
    paying: () => Effect.die('not asked'),
    within: () => (work) => work,
    soFar: Effect.succeed({}),
    savingTo: () => (work) => work,
  });

describe('the budget of a batch edit', () => {
  it('starts a photo the one that ended while it looked left room for', async () => {
    const started = await Effect.gen(function* () {
      const left = yield* Ref.make(1.2);
      const held = yield* Ref.make<Deferred.Deferred<void> | null>(null);
      return yield* Effect.gen(function* () {
        const withinBudget = yield* makeBudget();
        const go = yield* Deferred.make<void>();
        const first = yield* withinBudget(Deferred.await(go)).pipe(
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        // The second looks while the first holds everything, and the first
        // ends before it decides.
        yield* Ref.set(left, 0);
        const looking = yield* Deferred.make<void>();
        yield* Ref.set(held, looking);
        const second = yield* withinBudget(Effect.void).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Deferred.succeed(go, undefined);
        yield* Fiber.join(first);
        yield* Ref.set(left, 1.2);
        yield* Deferred.succeed(looking, undefined);
        return yield* Fiber.join(second);
      }).pipe(Effect.provideService(Spending, spendingWith(left, held)));
    }).pipe(Effect.runPromise);
    expect(Option.isSome(started)).toBe(true);
  });
});
