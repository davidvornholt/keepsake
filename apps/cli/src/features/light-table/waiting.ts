import process from 'node:process';
import { DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { isRunning } from '../../shared/processes.ts';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import { isWaiting, readMarks } from './marks.ts';

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

/** The marks an agent is to act on, as soon as there are some. */
export const waitForMarks = Effect.fn('waitForMarks')(function* (
  files: ShootFiles,
) {
  const fs = yield* FileSystem.FileSystem;
  const since = DateTime.formatIso(yield* DateTime.now);
  const handedOver = Effect.map(readMarks(files), (marks) =>
    marks.filter(isWaiting),
  );
  return yield* Effect.gen(function* () {
    let marks = yield* handedOver;
    while (marks.length === 0) {
      yield* Effect.sleep(interval);
      marks = yield* handedOver;
    }
    return marks;
  }).pipe((waiting) =>
    Effect.acquireUseRelease(
      writeJson(Waiting, files.waiting, { process: process.pid, since }),
      () => waiting,
      () => fs.remove(files.waiting, { force: true }).pipe(Effect.ignore),
    ),
  );
});
