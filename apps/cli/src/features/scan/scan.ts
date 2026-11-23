import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { developed } from '../../shared/develop.ts';
import { Moment, Photo, Shoot } from '../../shared/domain.ts';
import { InvalidInput, ToolFailed } from '../../shared/errors/errors.ts';
import { exclusively } from '../../shared/lock.ts';
import { inSteps } from '../../shared/progress.ts';
import {
  exists,
  readJson,
  type ShootFiles,
  shootFiles,
  writeBytes,
  writeJson,
} from '../../shared/store.ts';
import { toolBytes } from '../../shared/tools.ts';
import { type FoundPhoto, findPhotos } from './exif.ts';
import { hashOf, momentsOf } from './moments.ts';

/** The longest side of the previews the models look at. */
const previewSide = 2048;
const previewQuality = 90;
const concurrency = 8;

const notInName = /[^a-z0-9]+/gu;
const outerHyphens = /^-+|-+$/gu;
const combiningMarks = /\p{M}/gu;

/** A folder's name as a shoot's name: lowercase words joined by hyphens. */
export const nameFor = (folder: string): string =>
  folder
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replaceAll(combiningMarks, '')
    .replaceAll(notInName, '-')
    .replaceAll(outerHyphens, '');

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
};

/** Finds a folder's photos, makes previews and groups them into moments. */
export const scan = Effect.fn('scan')(function* (options: ScanOptions) {
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
  const shoot: Shoot = {
    name,
    source,
    about: Option.getOrElse(options.about, () =>
      Option.isSome(before) ? before.value.about : null,
    ),
  };
  return yield* Effect.gen(function* () {
    const found = yield* findPhotos(source);
    const results = yield* inSteps('scan', found, concurrency, (photo) =>
      preview(files, shoot, photo).pipe(
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
    const moments = momentsOf(photos);
    yield* writeJson(Shoot, files.shoot, shoot);
    yield* writeJson(Schema.Array(Photo), files.photos, photos);
    yield* writeJson(Schema.Array(Moment), files.moments, moments);
    return {
      shoot: shoot.name,
      source,
      about: shoot.about,
      photos: photos.length,
      moments: moments.length,
      unreadable,
    };
  }).pipe(exclusively(files));
});
