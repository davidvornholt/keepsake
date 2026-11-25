import { Effect, FileSystem, Option, Schema } from 'effect';
import { Description } from '../../shared/describing.ts';
import { EditRecord, Removal } from '../../shared/domain.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { exists, readJson } from '../../shared/store.ts';
import { wishIn } from '../../shared/wishes.ts';
import type { Edit } from './contract.ts';
import { type Gallery, pictureOf } from './pictures.ts';

const Removals = Schema.Array(Removal);
const earlierName = /^(?<stamp>\d+)\.jpg$/u;

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use an edit: ${error.message}` });

const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

/** The finished photos that the one made then replaced, newest first. */
const earlierOf = Effect.fn('earlierOf')(function* (
  gallery: Gallery,
  photo: string,
  made: number,
) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs
    .readDirectory(gallery.open.files.edit(photo).earlier)
    .pipe(
      Effect.catchReason('PlatformError', 'NotFound', () =>
        Effect.succeed([] as Array<string>),
      ),
      Effect.mapError(storeFailed),
    );
  const stamps = names
    .flatMap((name) => earlierName.exec(name)?.groups?.stamp ?? [])
    .map(Number)
    // Kept for a change that came to nothing, so it is still the current one.
    .filter((stamp) => stamp !== made)
    .toSorted((left, right) => right - left);
  return yield* Effect.forEach(stamps, (stamp) =>
    Effect.map(pictureOf(gallery, photo, `earlier-${stamp}`), (picture) => ({
      at: iso(stamp),
      picture,
    })),
  );
});

/** The edit of a photo, as the page shows it. */
export const editOf = Effect.fn('editOf')(function* (
  gallery: Gallery,
  photo: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const files = gallery.open.files.edit(photo);
  const isThere = (yield* exists(files.final)) && (yield* exists(files.camera));
  const record = isThere
    ? yield* readJson(EditRecord, files.record)
    : Option.none<EditRecord>();
  if (Option.isNone(record)) {
    return null;
  }
  const { crop, review, version } = record.value;
  const { mtime } = yield* fs
    .stat(files.final)
    .pipe(Effect.mapError(storeFailed));
  const made = Option.match(mtime, { onNone: () => 0, onSome: Number });
  const description = yield* readJson(Description, files.description);
  const removals = yield* readJson(Removals, files.removals);
  return {
    at: iso(made),
    isAi: version === 'ai',
    picture: yield* pictureOf(gallery, photo, 'final'),
    earlier: yield* earlierOf(gallery, photo, made),
    crop: crop.box,
    cropReason: crop.reason,
    subject: crop.subject,
    caption: Option.match(description, {
      onNone: () => null,
      onSome: ({ description: text }) => text,
    }),
    wish: yield* wishIn(files.wish),
    review,
    removed:
      version === 'ai'
        ? Option.getOrElse(removals, (): typeof Removals.Type => [])
        : [],
  } satisfies Edit;
});
