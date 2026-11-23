import process from 'node:process';
import { Effect, FileSystem } from 'effect';
import { ShootBusy, StoreFailed } from './errors/errors.ts';
import type { ShootFiles } from './store.ts';

const storeFailed = (path: string) => (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use ${path}: ${error.message}` });

const decimal = 10;

/** Whether a process is running; one of another user counts too. */
const isRunning = (pid: number) =>
  Effect.try({
    try: () => process.kill(pid, 0),
    catch: (error) => error as NodeJS.ErrnoException,
  }).pipe(
    Effect.as(true),
    Effect.catch((error) => Effect.succeed(error.code === 'EPERM')),
  );

const take = (files: ShootFiles) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .makeDirectory(files.root, { recursive: true })
      .pipe(Effect.mapError(storeFailed(files.root)));
    const create = fs.writeFileString(files.lock, `${process.pid}\n`, {
      flag: 'wx',
    });
    yield* create.pipe(
      Effect.catchReason('PlatformError', 'AlreadyExists', () =>
        Effect.gen(function* () {
          const holder = Number.parseInt(
            yield* fs.readFileString(files.lock),
            decimal,
          );
          if (Number.isInteger(holder) && (yield* isRunning(holder))) {
            return yield* new ShootBusy({
              message: `Another keepsake command (process ${holder}) is working on this shoot. Wait for it, or stop it.`,
            });
          }
          // Left behind by a command that was killed.
          yield* fs.remove(files.lock, { force: true });
          yield* create;
        }),
      ),
      Effect.mapError((error) =>
        error._tag === 'ShootBusy' ? error : storeFailed(files.lock)(error),
      ),
    );
  });

/** Runs a command that changes a shoot, while no other command does. */
export const exclusively =
  (files: ShootFiles) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      take(files),
      () => effect,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.remove(files.lock, { force: true }).pipe(Effect.ignore);
        }),
    );
