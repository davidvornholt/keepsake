import process from 'node:process';
import { Effect, FileSystem, Option } from 'effect';
import { ShootBusy, StoreFailed } from './errors/errors.ts';
import { isRunning } from './processes.ts';
import type { ShootFiles } from './store.ts';

const storeFailed = (path: string) => (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use ${path}: ${error.message}` });

const decimal = 10;

/** The process of the command that holds the lock, if it is still running. */
const holderOf = (files: ShootFiles) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const holder = Number.parseInt(
      yield* fs.readFileString(files.lock),
      decimal,
    );
    return Number.isInteger(holder) && (yield* isRunning(holder))
      ? Option.some(holder)
      : Option.none<number>();
  });

/** Whether a command that changes the shoot is running. */
export const isBusy = (files: ShootFiles) =>
  holderOf(files).pipe(
    Effect.map(Option.isSome),
    Effect.orElseSucceed(() => false),
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
          const holder = yield* holderOf(files);
          if (Option.isSome(holder)) {
            return yield* new ShootBusy({
              message: `Another keepsake command (process ${holder.value}) is working on this shoot. Wait for it, or stop it.`,
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
