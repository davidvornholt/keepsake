import { Effect, FileSystem, Option } from 'effect';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { atomically, type EditFiles, exists } from '../../shared/store.ts';

/**
 * Keeps a finished photo that a newer one is about to replace, under the time
 * it was made.
 */
export const keepEarlier = Effect.fn('keepEarlier')(function* ({
  final,
  earlier,
}: EditFiles) {
  if (!(yield* exists(final))) {
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  const failed = ({ message }: { readonly message: string }) =>
    new StoreFailed({ message: `Could not keep ${final}: ${message}` });
  const { mtime } = yield* fs.stat(final).pipe(Effect.mapError(failed));
  const made = Option.match(mtime, { onNone: () => 0, onSome: Number });
  yield* atomically(`${earlier}/${made}.jpg`, (draft) =>
    fs.copyFile(final, draft).pipe(Effect.mapError(failed)),
  );
});
