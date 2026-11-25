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
  const marks = yield* fs
    .readDirectory(files.marks)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
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
      files.labels,
      files.handOvers,
      files.preparation,
      files.agent,
      files.spending,
      files.verdicts(model),
      ...marks.map((name) => `${files.marks}/${name}`),
      ...edits,
    ],
    state,
    { concurrency: 'unbounded' },
  );
  return createHash('sha256')
    .update(JSON.stringify([marks, states]))
    .digest('hex')
    .slice(0, length);
});
