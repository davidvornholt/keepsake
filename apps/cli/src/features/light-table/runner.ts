import { DateTime, Effect, Fiber, type Semaphore } from 'effect';
import { openShoot, shootNames } from '../../shared/store.ts';
import { callerOf } from './calls.ts';
import { plan } from './carry-out.ts';
import { act } from './carry-steps.ts';
import { readCarrying, saveCarrying } from './carrying.ts';
import { agreeToMore } from './hand-over.ts';

// One runner for each shoot carries out what the owner handed over on the
// page, one step after the other, with the keepsake commands an agent would
// run, and without asking anyone but the owner.

const mostDollars = 10_000;

/** Carries out what was handed over, with the program that keepsake itself is started with. */
export const makeRunner = Effect.fn('makeRunner')(function* (
  keepsake: ReadonlyArray<string>,
  writing: Semaphore.Semaphore,
) {
  const scope = yield* Effect.scope;
  const call = callerOf(keepsake);
  /** The shoots being worked on, with the fiber once it is known. */
  const running = new Map<string, Fiber.Fiber<void> | null>();
  /** Those that were handed something while they were. */
  const wanted = new Set<string>();

  const once = Effect.fn('once')(function* (name: string) {
    for (;;) {
      const step = yield* writing.withPermits(1)(plan(name));
      if (step.kind === 'end') {
        return;
      }
      if (step.kind !== 'again') {
        yield* act(name, step, { call, writing });
      }
    }
  });

  /** Whether it is done for now, or goes round again for what came meanwhile. */
  const isThrough = (name: string) =>
    Effect.sync(() => {
      if (wanted.delete(name)) {
        return false;
      }
      running.delete(name);
      return true;
    });

  /** Notes what went wrong where the owner sees it, so it isn't taken as going on. */
  const noteFailure = (name: string, message: string) =>
    writing
      .withPermits(1)(
        Effect.gen(function* () {
          const { files } = yield* openShoot(name);
          const carrying = yield* readCarrying(files);
          if (carrying !== null && carrying.stopped === null) {
            yield* saveCarrying(files, {
              ...carrying,
              stopped: {
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

  const loop = (name: string) =>
    Effect.gen(function* () {
      let isDone = false;
      while (!isDone) {
        yield* once(name).pipe(
          Effect.catch((error) => noteFailure(name, error.message)),
        );
        isDone = yield* isThrough(name);
      }
    }).pipe(Effect.ensuring(Effect.sync(() => running.delete(name))));

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
    /** Whether this server works on the shoot now. */
    isWorking: (name: string) => running.has(name),
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
     * Goes on with what stopped and waits for the owner, with what more they
     * agreed to pay. Run it while nothing else on the page changes the shoot.
     */
    goOn: Effect.fn('goOn')(function* (name: string, dollars: number) {
      const { files } = yield* openShoot(name);
      const carrying = yield* readCarrying(files);
      const stop = carrying?.stopped ?? null;
      if (carrying !== null && stop !== null) {
        if (stop.needs === 'money') {
          yield* agreeToMore(
            files,
            stop.handOver,
            Math.min(Math.max(0, dollars), mostDollars),
          );
        }
        yield* saveCarrying(files, { ...carrying, stopped: null });
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
