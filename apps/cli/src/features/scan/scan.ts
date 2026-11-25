import { Clock, Effect, FileSystem, Option, Path, Ref, Schema } from 'effect';
import { noted } from '../../shared/activity.ts';
import { developed } from '../../shared/develop.ts';
import { Moment, Photo, Shoot } from '../../shared/domain.ts';
import { InvalidInput, ToolFailed } from '../../shared/errors/errors.ts';
import { type FoundPhoto, findPhotos } from '../../shared/exif.ts';
import { checkTimeZone } from '../../shared/local-time.ts';
import { exclusively } from '../../shared/lock.ts';
import { inSteps } from '../../shared/progress.ts';
import { nameFor } from '../../shared/shoot-names.ts';
import {
  exists,
  readJson,
  type ShootFiles,
  shootFiles,
  writeBytes,
  writeJson,
} from '../../shared/store.ts';
import { toolBytes } from '../../shared/tools.ts';
import { hashOf, momentsOf } from './moments.ts';

/** The longest side of the previews the models look at. */
const previewSide = 2048;
const previewQuality = 90;
const concurrency = 8;

const folderAt = Effect.fn('folderAt')(function* (folder: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = path.resolve(folder);
  const isFolder = yield* fs.stat(source).pipe(
    Effect.map((info) => info.type === 'Directory'),
    Effect.orElseSucceed(() => false),
  );
  if (!isFolder) {
    return yield* new InvalidInput({ message: `${source} is not a folder.` });
  }
  return source;
});

/** Makes the photo's preview unless it is there already, and hashes it. */
const preview = Effect.fn('preview')(function* (
  files: ShootFiles,
  shoot: Shoot,
  found: FoundPhoto,
) {
  const target = files.preview(found.id);
  if (!(yield* exists(target))) {
    const bytes = yield* developed(
      shoot,
      { ...found, hash: '' },
      { longSide: previewSide, quality: previewQuality },
    );
    yield* writeBytes(target, bytes);
  }
  const pixels = yield* toolBytes('magick', [
    target,
    '-colorspace',
    'Gray',
    '-resize',
    '9x8!',
    '-depth',
    '8',
    'gray:-',
  ]);
  return { ...found, hash: hashOf(pixels) } satisfies Photo;
});

type Outcome =
  | { readonly photo: Photo }
  | { readonly file: string; readonly reason: string };

type ScanOptions = {
  readonly folder: string;
  readonly name: Option.Option<string>;
  readonly about: Option.Option<string>;
  readonly timeZone: Option.Option<string>;
};

const Photos = Schema.Array(Photo);
const Moments = Schema.Array(Moment);

const oldestFirst = (left: Photo, right: Photo) =>
  left.takenAt.localeCompare(right.takenAt) || left.id.localeCompare(right.id);

/** How often what was found so far is noted, in milliseconds. */
const noteEvery = 3000;

/** Notes photos, for the page to show while there are still more to come. */
const makeNotes = Effect.fn('makeNotes')(function* (files: ShootFiles) {
  const before = Option.getOrElse(
    yield* readJson(Photos, files.photos),
    (): typeof Photos.Type => [],
  );
  const found = yield* Ref.make<ReadonlyMap<string, Photo>>(
    new Map(before.map((photo) => [photo.id, photo])),
  );
  const notedAt = yield* Ref.make(0);
  const write = Effect.fn('write')(function* (photos: ReadonlyArray<Photo>) {
    const moments = momentsOf(photos.toSorted(oldestFirst));
    yield* writeJson(Photos, files.photos, photos);
    yield* writeJson(Moments, files.moments, moments);
    return moments;
  });
  return {
    write,
    add: Effect.fn('add')(function* (photo: Photo) {
      const now = yield* Clock.currentTimeMillis;
      const all = yield* Ref.updateAndGet(
        found,
        (known) => new Map([...known, [photo.id, photo]]),
      );
      const isDue = yield* Ref.modify(notedAt, (last) =>
        now - last < noteEvery ? [false, last] : [true, now],
      );
      if (isDue) {
        yield* write([...all.values()]);
      }
    }),
  };
});

/** What a shoot is called and where its photos are. */
const shootOf = Effect.fn('shootOf')(function* (options: ScanOptions) {
  const path = yield* Path.Path;
  const source = yield* folderAt(options.folder);
  const name = Option.getOrElse(options.name, () =>
    nameFor(path.basename(source)),
  );
  const files = yield* shootFiles(name);
  const before = yield* readJson(Shoot, files.shoot);
  if (Option.isSome(before) && before.value.source !== source) {
    return yield* new InvalidInput({
      message: `The shoot ${name} is already about ${before.value.source}. Pass another --name.`,
    });
  }
  const timeZone = Option.isSome(options.timeZone)
    ? yield* checkTimeZone(options.timeZone.value)
    : Option.getOrUndefined(before)?.timeZone;
  const shoot: Shoot = {
    name,
    source,
    ...(timeZone === undefined ? {} : { timeZone }),
    about: Option.getOrElse(options.about, () =>
      Option.isSome(before) ? before.value.about : null,
    ),
  };
  return { shoot, files };
});

/** Finds a folder's photos, makes previews and groups them into moments. */
export const scan = Effect.fn('scan')(function* (options: ScanOptions) {
  const { shoot, files } = yield* shootOf(options);
  const { name, source, about } = shoot;
  return yield* Effect.gen(function* () {
    const found = yield* findPhotos(source);
    const notes = yield* makeNotes(files);
    const results = yield* inSteps('scan', found, concurrency, (photo) =>
      preview(files, shoot, photo).pipe(
        Effect.tap(notes.add),
        Effect.map((read): Outcome => ({ photo: read })),
        Effect.catchTag('ToolFailed', ({ message }) =>
          Effect.succeed<Outcome>({ file: photo.file, reason: message }),
        ),
      ),
    );
    const photos = results.flatMap((result) =>
      'photo' in result ? [result.photo] : [],
    );
    const unreadable = results.flatMap((result) =>
      'photo' in result ? [] : [result],
    );
    if (photos.length === 0) {
      return yield* new ToolFailed({
        message: `None of the ${unreadable.length} photos could be read. The first problem: ${unreadable[0]?.reason}`,
      });
    }
    yield* writeJson(Shoot, files.shoot, shoot);
    const moments = yield* notes.write(photos);
    return {
      shoot: name,
      source,
      about,
      photos: photos.length,
      moments: moments.length,
      unreadable,
    };
  }).pipe(noted({ files }), exclusively(files));
});
