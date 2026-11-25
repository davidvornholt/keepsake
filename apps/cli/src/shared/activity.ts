import process from 'node:process';
import { Context, Effect, FileSystem, Option, Ref, Schema } from 'effect';
import { isRunning } from './processes.ts';
import {
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeJson,
} from './store.ts';

/** What a command is doing with a shoot. */
export const ActivityRecord = Schema.Struct({
  process: Schema.Int,
  step: Schema.String,
  done: Schema.Int,
  total: Schema.Int,
  /** The photos being worked on. */
  photos: Schema.Array(Schema.String),
});
export type ActivityRecord = typeof ActivityRecord.Type;

type Change = (before: ActivityRecord) => ActivityRecord;

/** Where a command tells what it does, for the page. */
export const Activity = Context.Reference<
  (change: Change) => Effect.Effect<void>
>('@keepsake/cli/shared/Activity', { defaultValue: () => () => Effect.void });

/** Tells how far a step is. */
export const tellStep = Effect.fn('tellStep')(function* (
  step: string,
  done: number,
  total: number,
) {
  const tell = yield* Activity;
  yield* tell((before) => ({ ...before, step, done, total }));
});

/** Tells that a photo is being worked on meanwhile. */
export const during =
  (photo: string) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const tell = yield* Activity;
      yield* tell((before) => ({
        ...before,
        photos: [...before.photos, photo],
      }));
      return yield* work.pipe(
        Effect.ensuring(
          tell((before) => ({
            ...before,
            photos: before.photos.filter((other) => other !== photo),
          })),
        ),
      );
    });

/** Notes what the work tells in the shoot's folder until it is over. */
export const noted =
  ({ files }: OpenShoot) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const context = yield* Effect.context<FileSystem.FileSystem>();
      const state = yield* Ref.make<ActivityRecord>({
        process: process.pid,
        step: '',
        done: 0,
        total: 0,
        photos: [],
      });
      const tell = (change: Change) =>
        Ref.updateAndGet(state, change).pipe(
          Effect.flatMap((record) =>
            writeJson(ActivityRecord, files.activity, record),
          ),
          // Nobody needs it for the work itself.
          Effect.ignore,
          Effect.provide(context),
        );
      return yield* work.pipe(
        Effect.provideService(Activity, tell),
        Effect.ensuring(
          fs.remove(files.activity, { force: true }).pipe(Effect.ignore),
        ),
      );
    });

/** What a command is doing with the shoot, if one is. */
export const readActivity = Effect.fn('readActivity')(function* (
  files: ShootFiles,
) {
  const activity = yield* readJson(ActivityRecord, files.activity).pipe(
    Effect.map(Option.getOrNull),
    Effect.orElseSucceed(() => null),
  );
  // One that was killed left its file behind.
  return activity !== null && (yield* isRunning(activity.process))
    ? activity
    : null;
});
