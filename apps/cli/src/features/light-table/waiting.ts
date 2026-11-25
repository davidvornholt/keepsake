import process from 'node:process';
import { DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { isRunning } from '../../shared/processes.ts';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';

const Waiting = Schema.Struct({ process: Schema.Int, since: Schema.String });

/** Since when an agent waits for marks to be handed over, if one does. */
export const agentWaitsSince = Effect.fn('agentWaitsSince')(function* (
  files: ShootFiles,
) {
  const waiting = Option.getOrNull(yield* readJson(Waiting, files.waiting));
  return waiting !== null && (yield* isRunning(waiting.process))
    ? waiting.since
    : null;
});

const interval = '1 second';

/** What was handed over, as soon as that is something an agent can act on. */
export const waitForHandOver = Effect.fn('waitForHandOver')(function* <A, E, R>(
  files: ShootFiles,
  current: Effect.Effect<A, E, R>,
  isSomething: (now: A) => boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const since = DateTime.formatIso(yield* DateTime.now);
  return yield* Effect.gen(function* () {
    let now = yield* current;
    while (!isSomething(now)) {
      yield* Effect.sleep(interval);
      now = yield* current;
    }
    return now;
  }).pipe((waiting) =>
    Effect.acquireUseRelease(
      writeJson(Waiting, files.waiting, { process: process.pid, since }),
      () => waiting,
      () => fs.remove(files.waiting, { force: true }).pipe(Effect.ignore),
    ),
  );
});
