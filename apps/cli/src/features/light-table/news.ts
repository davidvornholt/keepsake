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

/**
 * Notes that the owner looked at what is new, as the page showed it: only
 * what the keys name, so what changed or came since stays new.
 */
export const seeItems = Effect.fn('seeItems')(function* (
  files: ShootFiles,
  keys: ReadonlyArray<string>,
) {
  const shown = new Set(keys);
  const seenAt = yield* now;
  const marks = (yield* readMarks(files)).filter(
    (mark) =>
      isNews(mark) && shown.has(`answer:${mark.id}:${mark.answer?.at ?? ''}`),
  );
  yield* Effect.forEach(marks, (mark) => saveMark(files, { ...mark, seenAt }));
  const added = yield* readAdded(files);
  const isShown = (one: Added[number]) =>
    one.seenAt === null && shown.has(`added:${one.photo}:${one.at}`);
  if (added.some(isShown)) {
    yield* writeJson(
      Added,
      files.added,
      added.map((one) => (isShown(one) ? { ...one, seenAt } : one)),
    );
  }
  const carrying = yield* readCarrying(files);
  const stopped = carrying?.stopped ?? null;
  if (
    carrying !== null &&
    stopped !== null &&
    stopped.seenAt === null &&
    shown.has(`stop:${stopped.id}`)
  ) {
    yield* saveCarrying(files, {
      ...carrying,
      stopped: { ...stopped, seenAt },
    });
  }
});
