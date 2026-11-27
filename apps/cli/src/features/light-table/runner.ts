import { DateTime, Effect, Fiber, type Semaphore } from 'effect';
import { asTheRunner } from '../../shared/lock.ts';
import { openShoot, shootNames } from '../../shared/store.ts';
import { callerOf } from './calls.ts';
import { plan, type Step } from './carry-out.ts';
import { act } from './carry-steps.ts';
import { newId, nobodyId, readCarrying, saveCarrying } from './carrying.ts';
import { agreeToMore } from './hand-over.ts';
import type { GoOn } from './schemas.ts';

// One runner for each shoot carries out what the owner handed over on the
// page, one step after the other, with the keepsake commands an agent would
// run, and without asking anyone but the owner. Only one server runs on the
// machine, and everything it changes goes one after the other through
// `writing`. The runner holds the shoot's runner lock for as long as it
// works, which tells the page so, and lets it go when it is through or waits
// for the owner, whose word to go on starts it again.

const mostDollars = 10_000;

/** Notes what went wrong where the owner sees it, so it isn't taken as going on. */
const noteFailure = (
  writing: Semaphore.Semaphore,
  name: string,
  message: string,
) =>
  writing
    .withPermits(1)(
      Effect.gen(function* () {
        const { files } = yield* openShoot(name);
        const carrying = yield* readCarrying(files);
        if (carrying !== null && carrying.stopped === null) {
          yield* saveCarrying(files, {
            ...carrying,
            stopped: {
              id: newId(),
              at: DateTime.formatIso(yield* DateTime.now),
              reason: `keepsake stopped: ${message}`,
              needs: 'retry',
              handOver: '',
              photos: [],
              seenAt: null,
            },
          });
        }
      }),
    )
    .pipe(Effect.ignore);

/** Carries out what was handed over, with the program that keepsake itself is started with. */
export const makeRunner = Effect.fn('makeRunner')(function* (
  keepsake: ReadonlyArray<string>,
  writing: Semaphore.Semaphore,
) {
  const scope = yield* Effect.scope;
  const call = callerOf(keepsake);
  /** The shoots being worked on, with the fiber once it is known. */
  const running = new Map<string, Fiber.Fiber<void> | null>();
  /** Those whose runner lock this server holds now. */
  const holding = new Set<string>();
  /** Those that were handed something while they were. */
  const wanted = new Set<string>();

  /**
   * The next step. That nothing is left is worked out together with whether
   * something was handed over meanwhile, while nothing changes, so the runner
   * never lets go of what came in between.
   */
  const next = (name: string) =>
    writing.withPermits(1)(
      Effect.map(
        plan(name),
        (step): Step =>
          step.kind === 'end' && wanted.delete(name) ? { kind: 'again' } : step,
      ),
    );

  const once = Effect.fn('once')(function* (name: string) {
    for (;;) {
      const step = yield* next(name);
      if (step.kind === 'end') {
        return;
      }
      if (step.kind !== 'again') {
        yield* act(name, step, { call, writing });
      }
    }
  });

  /** Whether it is done for now, or goes round again for what came meanwhile. */
  const isThrough = (name: string) => Effect.sync(() => !wanted.delete(name));

  const work = (name: string) =>
    Effect.gen(function* () {
      holding.add(name);
      let isDone = false;
      while (!isDone) {
        yield* once(name).pipe(
          Effect.catch((error) => noteFailure(writing, name, error.message)),
        );
        isDone = yield* isThrough(name);
      }
    }).pipe(Effect.ensuring(Effect.sync(() => holding.delete(name))));

  const loop = (
    name: string,
  ): Effect.Effect<void, never, Effect.Services<ReturnType<typeof work>>> =>
    Effect.gen(function* () {
      const { files } = yield* openShoot(name);
      // Whoever else holds the lock, as the page's tests do, works on it.
      yield* asTheRunner(files)(work(name));
    }).pipe(
      Effect.catch((error) => noteFailure(writing, name, error.message)),
      Effect.ensuring(
        Effect.suspend(() => {
          running.delete(name);
          // What was handed over after it was through, but before it let go.
          return wanted.delete(name) ? start(name) : Effect.void;
        }),
      ),
    );

  const start = Effect.fn('start')(function* (name: string) {
    if (running.has(name)) {
      wanted.add(name);
      return;
    }
    running.set(name, null);
    const fiber = yield* Effect.forkIn(loop(name), scope);
    if (running.has(name)) {
      running.set(name, fiber);
    }
  });

  return {
    start,
    /** Whether this server holds the shoot's runner lock and works on it now. */
    isWorking: (name: string) => holding.has(name),
    /** Stops working on a shoot that is forgotten. */
    stop: Effect.fn('stop')(function* (name: string) {
      wanted.delete(name);
      const fiber = running.get(name);
      running.delete(name);
      if (fiber !== undefined && fiber !== null) {
        yield* Fiber.interrupt(fiber);
      }
    }),
    /**
     * Goes on with what stopped and waits for the owner, once for each stop:
     * a word about another stop than the one there is, such as from a tab
     * that shows an older one, or a second word about the same, adds
     * nothing. With what more they agreed to pay when it ran out of money.
     * Run it while nothing else on the page changes the shoot.
     */
    goOn: Effect.fn('goOn')(function* (name: string, word: GoOn) {
      const { files } = yield* openShoot(name);
      const carrying = yield* readCarrying(files);
      const stop = carrying?.stopped ?? null;
      if (carrying !== null && stop !== null && stop.id === word.stop) {
        if (stop.needs === 'money') {
          yield* agreeToMore(
            files,
            { handOver: stop.handOver, stop: stop.id },
            Math.min(Math.max(0, word.dollars), mostDollars),
          );
        }
        yield* saveCarrying(files, { ...carrying, stopped: null });
      } else if (stop !== null || word.stop !== nobodyId) {
        return;
      }
      yield* start(name);
    }),
    /** Goes on with what a server before this one didn't get through. */
    resume: Effect.gen(function* () {
      yield* Effect.forEach(yield* shootNames, (name) => start(name), {
        discard: true,
      });
    }),
  };
});
export type Runner = Effect.Success<ReturnType<typeof makeRunner>>;
