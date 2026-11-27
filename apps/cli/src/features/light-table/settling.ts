import { Duration, Effect, FiberMap, type Semaphore } from 'effect';
import {
  exists,
  openShoot,
  shootFiles,
  shootNames,
} from '../../shared/store.ts';
import { settle } from './choices.ts';

const pause = Duration.seconds(2);

/**
 * Does what the owner chose as soon as nothing else changes the choice or
 * the album, and keeps at it while something waits for that.
 */
export const makeSettling = Effect.fn('makeSettling')(function* (
  writing: Semaphore.Semaphore,
) {
  const running = yield* FiberMap.make<string>();

  /** Says whether something still waits. */
  const once = (name: string) =>
    Effect.gen(function* () {
      // Nothing waits in a shoot that was forgotten.
      if (!(yield* exists((yield* shootFiles(name)).choices))) {
        return false;
      }
      return yield* settle(yield* openShoot(name));
    }).pipe(
      writing.withPermits(1),
      Effect.orElseSucceed(() => true),
    );

  const keepAt = (name: string) =>
    Effect.gen(function* () {
      let waits = true;
      while (waits) {
        yield* Effect.sleep(pause);
        waits = yield* once(name);
      }
    });

  const start = (name: string) =>
    FiberMap.run(running, name, keepAt(name), { onlyIfMissing: true }).pipe(
      Effect.asVoid,
    );

  return {
    /** Does it now, and later what has to wait. */
    now: Effect.fn('now')(function* (name: string) {
      const open = yield* openShoot(name);
      if (yield* settle(open)) {
        yield* start(name);
      }
    }),
    stop: (name: string) => FiberMap.remove(running, name),
    /** Goes on with what waited when a server before this one stopped. */
    resume: Effect.gen(function* () {
      const names = yield* shootNames;
      yield* Effect.forEach(
        names,
        (name) =>
          Effect.gen(function* () {
            if (yield* exists((yield* shootFiles(name)).choices)) {
              yield* start(name);
            }
          }).pipe(Effect.ignore),
        { discard: true },
      );
    }),
  };
});
export type Settling = Effect.Success<ReturnType<typeof makeSettling>>;
