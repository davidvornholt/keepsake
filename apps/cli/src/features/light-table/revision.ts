import { createHash } from 'node:crypto';
import { Effect, FileSystem, Option } from 'effect';
import type { OpenShoot } from '../../shared/store.ts';

const length = 16;

/** Changes whenever something the page shows about a shoot does. */
export const revisionOf = Effect.fn('revisionOf')(function* (
  { files, photos }: OpenShoot,
  model: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const state = (file: string) =>
    fs.stat(file).pipe(
      Effect.map(({ mtime, size }) => {
        const changed = Option.match(mtime, {
          onNone: () => 0,
          onSome: (time) => time.getTime(),
        });
        return `${changed}-${size}`;
      }),
      Effect.orElseSucceed(() => ''),
    );
  const edits = [...photos.keys()].flatMap((photo) => {
    const { record, final } = files.edit(photo);
    return [record, final];
  });
  const namesIn = (directory: string) =>
    fs
      .readDirectory(directory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const marks = yield* namesIn(files.marks);
  const handOvers = yield* namesIn(files.handOvers);
  const states = yield* Effect.forEach(
    [
      files.shoot,
      files.judge,
      files.photos,
      files.moments,
      files.picks,
      files.reasons,
      files.ratings,
      files.toRate,
      files.album,
      files.removed,
      files.choices,
      files.labels,
      files.preparation,
      files.carrying,
      files.added,
      files.spending,
      files.verdicts(model),
      ...marks.map((name) => `${files.marks}/${name}`),
      ...handOvers.map((name) => `${files.handOvers}/${name}`),
      ...edits,
    ],
    state,
    { concurrency: 'unbounded' },
  );
  return createHash('sha256')
    .update(JSON.stringify([marks, handOvers, states]))
    .digest('hex')
    .slice(0, length);
});
