// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
import { Effect, Path, Schema } from 'effect';
import type { Photo } from '../../shared/domain.ts';
import { InvalidInput, ToolFailed } from '../../shared/errors/errors.ts';
import { runTool } from '../../shared/tools.ts';

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
  Orientation: Schema.optionalKey(Text),
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
        orientation: orientationOf(exif.Orientation),
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

/** Every photo in a folder and the folders below it. */
export const findPhotos = Effect.fn('findPhotos')(function* (source: string) {
  const path = yield* Path.Path;
  const { stdout, stderr } = yield* runTool('exiftool', [
    '-json',
    '-n',
    '-r',
    ...[...rawExtensions, ...pictureExtensions].flatMap((extension) => [
      '-ext',
      extension,
    ]),
    '-SubSecDateTimeOriginal',
    '-DateTimeOriginal',
    '-FileModifyDate',
    '-Model',
    '-LensModel',
    '-FocalLength',
    '-Orientation',
    '-JpgFromRawLength',
    source,
  ]);
  if (stdout.length === 0) {
    return yield* new InvalidInput({
      message: `There are no photos in ${source}${stderr === '' ? '' : ` (exiftool says: ${stderr})`}.`,
    });
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
  return foundPhotos(
    list.map((exif) => ({
      file: path.relative(source, exif.SourceFile),
      exif,
    })),
  );
});
