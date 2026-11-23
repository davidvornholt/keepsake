import { Effect, FileSystem, Path } from 'effect';
import type { Box, Photo, Shoot } from './domain.ts';
import { StoreFailed } from './errors/errors.ts';
import { toolBytes } from './tools.ts';

/** ImageMagick's names for the EXIF orientations 1 to 8. */
const orientations = [
  'TopLeft',
  'TopRight',
  'BottomRight',
  'BottomLeft',
  'LeftTop',
  'RightTop',
  'RightBottom',
  'LeftBottom',
] as const;

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({
    message: `Could not use a temporary folder: ${error.message}`,
  });

export type Development = {
  /** The part to show; all of it when absent. */
  readonly box?: Box;
  /** The longest side in pixels; larger pictures are made smaller. */
  readonly longSide?: number;
  /** JPEG quality, 1 to 100. */
  readonly quality: number;
};

/**
 * ImageMagick's geometry for a box. It works the fractions out itself, since
 * the size isn't known before the picture is turned the right way up.
 */
const cropGeometry = ({ left, top, right, bottom }: Box) =>
  `%[fx:round(w*${right - left})]x%[fx:round(h*${bottom - top})]+%[fx:round(w*${left})]+%[fx:round(h*${top})]`;

const toJpeg = (input: string, photo: Photo, development: Development) => {
  const { box, longSide, quality } = development;
  const orientation = orientations[photo.orientation - 1];
  return toolBytes('magick', [
    // Lets the JPEG decoder skip detail that a smaller picture won't show.
    ...(longSide === undefined || box !== undefined
      ? []
      : ['-define', `jpeg:size=${longSide}x${longSide}`]),
    input,
    // The camera's own JPEG inside a RAW file often doesn't say how the
    // camera was held, but the RAW file does.
    ...(photo.cameraJpeg && orientation !== undefined
      ? ['-orient', orientation]
      : []),
    '-auto-orient',
    '-colorspace',
    'sRGB',
    ...(box === undefined ? [] : ['-crop', cropGeometry(box), '+repage']),
    ...(longSide === undefined ? [] : ['-resize', `${longSide}x${longSide}>`]),
    '-strip',
    '-quality',
    String(quality),
    'jpg:-',
  ]);
};

/**
 * A photo the way the camera would show it, the right way up and without
 * metadata: the camera's own full-size JPEG where a RAW file holds one, and
 * ImageMagick's reading of the file otherwise.
 */
export const developed = Effect.fn('developed')(function* (
  shoot: Shoot,
  photo: Photo,
  development: Development,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = path.join(shoot.source, photo.file);
  if (!photo.cameraJpeg) {
    return yield* toJpeg(source, photo, development);
  }
  const directory = yield* fs
    .makeTempDirectoryScoped({ prefix: 'keepsake-' })
    .pipe(Effect.mapError(storeFailed));
  const embedded = path.join(directory, 'embedded.jpg');
  yield* fs
    .writeFile(
      embedded,
      yield* toolBytes('exiftool', ['-b', '-JpgFromRaw', source]),
    )
    .pipe(Effect.mapError(storeFailed));
  return yield* toJpeg(embedded, photo, development);
}, Effect.scoped);
