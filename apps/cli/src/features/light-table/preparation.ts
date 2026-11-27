import process from 'node:process';
import { DateTime, Effect, FiberMap, FileSystem, Option, Schema } from 'effect';
import type { Shoot } from '../../shared/domain.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { isRunning } from '../../shared/processes.ts';
import {
  openShoot,
  readJson,
  type ShootFiles,
  shootFiles,
  shootNames,
  writeJson,
} from '../../shared/store.ts';
import { callerOf } from './calls.ts';
import type { Preparation } from './contract.ts';

// Getting a new shoot ready for the owner costs nothing, so the page does it:
// it runs keepsake itself, up to but without the edits.

const Noted = Schema.Struct({
  /** The process of the server that sees to it. */
  process: Schema.Int,
  since: Schema.String,
  maximum: Schema.NullOr(Schema.Int),
  stopped: Schema.NullOr(Schema.String),
});
type Noted = typeof Noted.Type;

const readNoted = (files: ShootFiles) =>
  Effect.map(readJson(Noted, files.preparation), Option.getOrNull);

/** How getting a shoot ready goes, until it is. */
export const readPreparation = Effect.fn('readPreparation')(function* (
  files: ShootFiles,
) {
  const noted = yield* readNoted(files);
  if (noted === null) {
    return null;
  }
  const { since, stopped } = noted;
  const isGoing = stopped === null && (yield* isRunning(noted.process));
  return {
    since,
    stopped: isGoing ? null : (stopped ?? 'It was interrupted.'),
  } satisfies Preparation;
});

/** Notes that a shoot is to be got ready. */
export const notePreparation = (files: ShootFiles, maximum: number | null) =>
  Effect.gen(function* () {
    yield* writeJson(Noted, files.preparation, {
      process: process.pid,
      since: DateTime.formatIso(yield* DateTime.now),
      maximum,
      stopped: null,
    });
  });

const argumentsFor = (shoot: Shoot, maximum: number | null) => [
  'run',
  shoot.source,
  '--unedited',
  '--name',
  shoot.name,
  '--title',
  shoot.title,
  ...(shoot.about === null ? [] : ['--about', shoot.about]),
  ...(shoot.timeZone === undefined ? [] : ['--time-zone', shoot.timeZone]),
  ...(maximum === null ? [] : ['--maximum', String(maximum)]),
];

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use a shoot: ${error.message}` });

/** Gets shoots ready with the program that keepsake itself is started with. */
export const makePreparations = Effect.fn('makePreparations')(function* (
  keepsake: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const running = yield* FiberMap.make<string>();
  const call = callerOf(keepsake);

  const work = Effect.fn('work')(function* (shoot: Shoot, noted: Noted) {
    const files = yield* shootFiles(shoot.name);
    const called = yield* call(argumentsFor(shoot, noted.maximum));
    // Why it stopped, or null when it is through.
    const stopped = called.kind === 'done' ? null : called.message;
    yield* stopped === null
      ? fs
          .remove(files.preparation, { force: true })
          .pipe(Effect.mapError(storeFailed))
      : writeJson(Noted, files.preparation, { ...noted, stopped });
  });

  /** Starts, or goes on with, a shoot that was noted. */
  const start = Effect.fn('start')(function* (name: string) {
    const { files, shoot } = yield* openShoot(name);
    const before = yield* readNoted(files);
    if (before !== null) {
      const noted = { ...before, process: process.pid, stopped: null };
      yield* writeJson(Noted, files.preparation, noted);
      yield* FiberMap.run(running, name, Effect.ignore(work(shoot, noted)), {
        onlyIfMissing: true,
      });
    }
  });

  return {
    start,
    stop: (name: string) => FiberMap.remove(running, name),
    /** Goes on with what a server before this one didn't get through. */
    resume: Effect.gen(function* () {
      const names = yield* shootNames;
      yield* Effect.forEach(
        names,
        (name) =>
          Effect.gen(function* () {
            const noted = yield* readNoted(yield* shootFiles(name));
            if (
              noted !== null &&
              noted.stopped === null &&
              !(yield* isRunning(noted.process))
            ) {
              yield* start(name);
            }
          }).pipe(Effect.ignore),
        { discard: true },
      );
    }),
  };
});
export type Preparations = Effect.Success<ReturnType<typeof makePreparations>>;
