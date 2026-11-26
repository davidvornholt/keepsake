// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import type { Photo } from './domain.ts';
import { InvalidInput, StoreFailed, ToolFailed } from './errors/errors.ts';
import { runTool } from './tools.ts';

const rawExtensions = [
  'arw',
  'cr2',
  'cr3',
  'dng',
  'nef',
  'orf',
  'pef',
  'raf',
  'rw2',
] as const;
const pictureExtensions = ['jpg', 'jpeg', 'heic', 'hif'] as const;
const isRaw = (extension: string) =>
  (rawExtensions as ReadonlyArray<string>).includes(extension);

// exiftool prints whatever looks like a number as one.
const Text = Schema.Union([Schema.String, Schema.Finite]);

const Exif = Schema.Struct({
  SourceFile: Schema.String,
  SubSecDateTimeOriginal: Schema.optionalKey(Text),
  DateTimeOriginal: Schema.optionalKey(Text),
  FileModifyDate: Text,
  Model: Schema.optionalKey(Text),
  LensModel: Schema.optionalKey(Text),
  FocalLength: Schema.optionalKey(Text),
  FNumber: Schema.optionalKey(Text),
  ExposureTime: Schema.optionalKey(Text),
  ISO: Schema.optionalKey(Text),
  OffsetTimeOriginal: Schema.optionalKey(Text),
  Orientation: Schema.optionalKey(Text),
  ImageSize: Schema.optionalKey(Text),
  FullImageSize: Schema.optionalKey(Text),
  JpgFromRawLength: Schema.optionalKey(Text),
});
export type Exif = typeof Exif.Type;
const ExifList = Schema.fromJsonString(Schema.Array(Exif));

const datePattern =
  /^(?<year>\d{4}):(?<month>\d\d):(?<day>\d\d) (?<time>\d\d:\d\d:\d\d)(?:\.(?<fraction>\d+))?/u;
const milliseconds = 3;

/** 2026:03:30 18:04:05.12+08:00 as 2026-03-30T18:04:05.120. */
export const cameraTime = (value: string): string | undefined => {
  const found = datePattern.exec(value)?.groups;
  if (found === undefined) {
    return;
  }
  const digits = (found.fraction ?? '')
    .padEnd(milliseconds, '0')
    .slice(0, milliseconds);
  return `${found.year}-${found.month}-${found.day}T${found.time}.${digits}`;
};

const text = (value: string | number | undefined) => {
  const trimmed = value === undefined ? '' : String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const number = (value: string | number | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const offsetPattern = /^(?:Z|[+-]\d\d:\d\d)$/u;

const offsetOf = (value: string | number | undefined) => {
  const offset = text(value);
  return offset !== null && offsetPattern.test(offset) ? offset : null;
};

const uprightOrientation = 1;
const lastOrientation = 8;

const orientationOf = (value: string | number | undefined) => {
  const parsed = number(value);
  return parsed !== null &&
    Number.isInteger(parsed) &&
    parsed >= uprightOrientation &&
    parsed <= lastOrientation
    ? parsed
    : uprightOrientation;
};

const sizePattern = /^(?<across>\d+)[ x](?<down>\d+)$/u;
const firstTurned = 5;

/**
 * How large the picture is. Sony's RAW files say separately how much of the
 * sensor is the picture.
 */
const sizeOf = (exif: Exif) => {
  const size = text(exif.FullImageSize) ?? text(exif.ImageSize) ?? '';
  const found = sizePattern.exec(size)?.groups;
  const across = Number(found?.across ?? 0);
  const down = Number(found?.down ?? 0);
  return orientationOf(exif.Orientation) < firstTurned
    ? { width: across, height: down }
    : { width: down, height: across };
};

/** A photo without its hash, which takes its picture to compute. */
export type FoundPhoto = Omit<Photo, 'hash'>;

/** What exiftool found, as one photo per picture, oldest first. */
export const foundPhotos = (
  found: ReadonlyArray<{ readonly file: string; readonly exif: Exif }>,
): ReadonlyArray<FoundPhoto> => {
  const photos = new Map<string, FoundPhoto>();
  for (const { file, exif } of found) {
    const dot = file.lastIndexOf('.');
    const id = file.slice(0, dot);
    const raw = isRaw(file.slice(dot + 1).toLowerCase());
    // A RAW file and the JPEG the camera saved beside it are one photo.
    if (raw || !photos.has(id)) {
      photos.set(id, {
        id,
        file,
        takenAt:
          cameraTime(String(exif.SubSecDateTimeOriginal ?? '')) ??
          cameraTime(String(exif.DateTimeOriginal ?? '')) ??
          cameraTime(String(exif.FileModifyDate)) ??
          '1970-01-01T00:00:00.000',
        camera: text(exif.Model),
        lens: text(exif.LensModel),
        focalLength: number(exif.FocalLength ?? 'none'),
        aperture: number(exif.FNumber ?? 'none'),
        exposure: number(exif.ExposureTime ?? 'none'),
        iso: number(exif.ISO ?? 'none'),
        utcOffset: offsetOf(exif.OffsetTimeOriginal),
        orientation: orientationOf(exif.Orientation),
        ...sizeOf(exif),
        raw,
        cameraJpeg: raw && exif.JpgFromRawLength !== undefined,
      });
    }
  }
  return [...photos.values()].toSorted(
    (left, right) =>
      left.takenAt.localeCompare(right.takenAt) ||
      left.id.localeCompare(right.id),
  );
};

export const photoExtensions = [...rawExtensions, ...pictureExtensions];

/** Whether a path is inside a folder, and not the folder itself. */
export const isInside = (path: Path.Path, folder: string, file: string) => {
  const relative = path.relative(folder, file);
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
};

const isPhoto = new Set<string>(photoExtensions);

/** A photo's file, and when it was last changed. */
export type PhotoFile = { readonly file: string; readonly modified: number };

/** How many files are looked at at once. */
const concurrency = 64;

/**
 * The photo's file, unless it can't be read now or a link takes it from
 * outside the folder, since keepsake reads only the folder it is given.
 */
const photoFileAt = Effect.fn('photoFileAt')(function* (
  folder: string,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const real = yield* fs.realPath(file).pipe(Effect.option);
  const info = yield* fs.stat(file).pipe(Effect.option);
  return Option.isNone(real) ||
    Option.isNone(info) ||
    info.value.type !== 'File' ||
    !isInside(path, folder, real.value)
    ? []
    : [
        {
          file,
          modified: Option.match(info.value.mtime, {
            onNone: () => 0,
            onSome: Number,
          }),
        } satisfies PhotoFile,
      ];
});

/** Every photo in a folder and the folders below it that aren't hidden. */
export const photoFilesIn = Effect.fn('photoFilesIn')(function* (
  folder: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const unreadable = (error: { readonly message: string }) =>
    new StoreFailed({ message: `Could not read ${folder}: ${error.message}` });
  const names = yield* fs
    .readDirectory(folder, { recursive: true })
    .pipe(Effect.mapError(unreadable));
  const real = yield* fs.realPath(folder).pipe(Effect.mapError(unreadable));
  const candidates = names.filter(
    (name) =>
      !name.split(path.sep).some((part) => part.startsWith('.')) &&
      isPhoto.has(path.extname(name).slice(1).toLowerCase()),
  );
  const found = yield* Effect.forEach(
    candidates,
    (name) => photoFileAt(real, path.join(folder, name)),
    { concurrency },
  );
  return found.flat();
});

/**
 * How many bytes of paths one run of exiftool is given, 256 KiB, far below what Linux
 * lets a program be given. Each is given on its own, since in an argument file
 * exiftool takes some characters for others.
 */
const batchBytes = 262_144;
/** What Linux counts for each argument beyond its bytes. */
const argumentOverhead = 9;

/** Files in batches that each name at most `batchBytes` of them. */
const inBatches = (files: ReadonlyArray<string>) => {
  const batches: Array<Array<string>> = [];
  let size = 0;
  for (const file of files) {
    const bytes = Buffer.byteLength(file) + argumentOverhead;
    const last = batches.at(-1);
    if (last === undefined || size + bytes > batchBytes) {
      batches.push([file]);
      size = bytes;
    } else {
      last.push(file);
      size += bytes;
    }
  }
  return batches;
};

const exifOf = Effect.fn('exifOf')(function* (files: ReadonlyArray<string>) {
  const { stdout, stderr } = yield* runTool('exiftool', [
    '-json',
    '-n',
    '-SubSecDateTimeOriginal',
    '-DateTimeOriginal',
    '-FileModifyDate',
    '-Model',
    '-LensModel',
    '-FocalLength',
    '-FNumber',
    '-ExposureTime',
    '-ISO',
    '-OffsetTimeOriginal',
    '-Orientation',
    '-ImageSize',
    '-FullImageSize',
    '-JpgFromRawLength',
    '--',
    ...files,
  ]);
  if (stdout.length === 0) {
    return { list: [], stderr };
  }
  const list = yield* Schema.decodeUnknownEffect(ExifList)(
    new TextDecoder().decode(stdout),
  ).pipe(
    Effect.mapError(
      (error) =>
        new ToolFailed({
          message: `exiftool answered with something unexpected: ${error.message}`,
        }),
    ),
  );
  return { list, stderr };
});

/** What exiftool finds in some files of a folder. */
const readExif = Effect.fn('readExif')(function* (
  source: string,
  files: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const read = yield* Effect.forEach(inBatches(files), exifOf);
  const list = read.flatMap((batch) => batch.list);
  if (list.length === 0) {
    const said = read.map((batch) => batch.stderr).find((one) => one !== '');
    return yield* new InvalidInput({
      message: `There are no photos in ${source}${said === undefined ? '' : ` (exiftool says: ${said})`}.`,
    });
  }
  return foundPhotos(
    list.map((exif) => ({
      file: path.relative(source, exif.SourceFile),
      exif,
    })),
  );
});

/** Every photo in a folder and the folders below it. */
export const findPhotos = Effect.fn('findPhotos')(function* (source: string) {
  const files = yield* photoFilesIn(source);
  if (files.length === 0) {
    return yield* new InvalidInput({
      message: `There are no photos in ${source}.`,
    });
  }
  return yield* readExif(
    source,
    files.map(({ file }) => file),
  );
});

/**
 * Some photos of a folder, by their paths below it. Only those that are still
 * photos in it are read, since what was found of it may be old by now.
 */
export const readPhotos = Effect.fn('readPhotos')(function* (
  source: string,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const real = yield* fs
    .realPath(source)
    .pipe(
      Effect.mapError(
        ({ message }) =>
          new StoreFailed({ message: `Could not read ${source}: ${message}` }),
      ),
    );
  const kept = yield* Effect.forEach(
    files,
    (file) => photoFileAt(real, path.join(source, file)),
    { concurrency },
  );
  return yield* readExif(
    source,
    kept.flat().map(({ file }) => file),
  );
});
