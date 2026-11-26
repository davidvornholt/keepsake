import { Effect, FileSystem, Option, Schema } from 'effect';
import { Box } from '../../shared/domain.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import {
  type EditFiles,
  type OpenShoot,
  readJson,
  writeJson,
} from '../../shared/store.ts';

/**
 * An edit command that starts photos over or edits them with a wish. Run
 * again after it stopped, it goes on where it was, so nothing is paid twice;
 * once it is done, the same command starts them over once more.
 */
const Command = Schema.Struct({
  again: Schema.Boolean,
  wish: Schema.NullOr(Schema.String),
  areas: Schema.Array(Box),
  photos: Schema.Array(Schema.String),
});
type Command = typeof Command.Type;
const sameCommand = Schema.toEquivalence(Command);

const Anew = Schema.Struct({ id: Schema.String, ...Command.fields });

/** Where a photo's edit is in such a command. */
const Progress = Schema.Struct({
  anew: Schema.String,
  /** What didn't work once the photo is done, null until then. */
  notDone: Schema.NullOr(Schema.Array(Schema.String)),
});

/** The id of the command, which is the one that stopped if it is the same. */
export const anewFor = Effect.fn('anewFor')(function* (
  open: OpenShoot,
  command: Command,
) {
  const wanted = { ...command, photos: command.photos.toSorted() };
  const before = yield* readJson(Anew, open.files.anew);
  if (Option.isSome(before)) {
    const { id, ...stopped } = before.value;
    if (sameCommand(stopped, wanted)) {
      return id;
    }
  }
  const id = crypto.randomUUID();
  yield* writeJson(Anew, open.files.anew, { id, ...wanted });
  return id;
});

/** Forgets the command once all of its photos are done. */
export const doneWithAnew = Effect.fn('doneWithAnew')(function* (
  open: OpenShoot,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(open.files.anew, { force: true })
    .pipe(Effect.mapError(({ message }) => new StoreFailed({ message })));
});

const progressIn = (files: EditFiles, anew: string) =>
  Effect.map(readJson(Progress, files.anew), (progress) =>
    Option.filter(progress, (known) => known.anew === anew),
  );

/** What didn't work, if the command is done with the photo. */
export const doneIn = (files: EditFiles, anew: string) =>
  Effect.map(progressIn(files, anew), (progress) =>
    Option.flatMap(progress, ({ notDone }) => Option.fromNullOr(notDone)),
  );

/** Whether the command started the photo over and isn't done with it. */
export const isGoingOn = (files: EditFiles, anew: string) =>
  Effect.map(progressIn(files, anew), (progress) =>
    Option.exists(progress, ({ notDone }) => notDone === null),
  );

export const noteProgress = (
  files: EditFiles,
  anew: string,
  notDone: ReadonlyArray<string> | null,
) => writeJson(Progress, files.anew, { anew, notDone });
