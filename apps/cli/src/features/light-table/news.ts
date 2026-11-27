import { DateTime, Effect, Option, Schema } from 'effect';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import { readCarrying, saveCarrying } from './carrying.ts';
import { isNews, readMarks, saveMark } from './marks.ts';

// What the owner hasn't looked at yet: the answers to their marks, the photos
// their order put into the album, and what waits for their word. Each is about
// a photo, and looking at the photo sees all of it.

const Added = Schema.Array(
  Schema.Struct({
    photo: Schema.String,
    at: Schema.String,
    seenAt: Schema.NullOr(Schema.String),
  }),
);
export type Added = typeof Added.Type;

export const readAdded = (files: ShootFiles) =>
  Effect.map(readJson(Added, files.added), (found) =>
    Option.getOrElse(found, (): Added => []),
  );

const now = Effect.map(DateTime.now, DateTime.formatIso);

/** Notes that an order put these photos into the album. */
export const noteAdded = Effect.fn('noteAdded')(function* (
  files: ShootFiles,
  photos: ReadonlyArray<string>,
) {
  if (photos.length === 0) {
    return;
  }
  const at = yield* now;
  const before = yield* readAdded(files);
  const fresh = new Set(photos);
  yield* writeJson(Added, files.added, [
    ...before.filter(({ photo }) => !fresh.has(photo)),
    ...photos.map((photo) => ({ photo, at, seenAt: null })),
  ]);
});

/** Notes that the owner looked at everything new about a photo. */
export const seePhoto = Effect.fn('seePhoto')(function* (
  files: ShootFiles,
  photo: string,
) {
  const seenAt = yield* now;
  const marks = (yield* readMarks(files)).filter(
    (mark) => mark.photo === photo && isNews(mark),
  );
  yield* Effect.forEach(marks, (mark) => saveMark(files, { ...mark, seenAt }));
  const added = yield* readAdded(files);
  if (added.some((one) => one.photo === photo && one.seenAt === null)) {
    yield* writeJson(
      Added,
      files.added,
      added.map((one) =>
        one.photo === photo && one.seenAt === null ? { ...one, seenAt } : one,
      ),
    );
  }
  const carrying = yield* readCarrying(files);
  const stopped = carrying?.stopped ?? null;
  if (
    carrying !== null &&
    stopped !== null &&
    stopped.seenAt === null &&
    stopped.photos.includes(photo)
  ) {
    yield* saveCarrying(files, {
      ...carrying,
      stopped: { ...stopped, seenAt },
    });
  }
});
