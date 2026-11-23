import { Effect } from 'effect';
import { toolBytes, toolText } from '../../shared/tools.ts';
import { clockIn } from './clock.ts';

const quality = '95';

/** IPTC's word for a photo that was edited with a trained image model. */
const digitalSourceType =
  'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';

export type CameraData = {
  /** The photo as the camera took it, which is only read. */
  readonly original: string;
  /** Where the photo was taken, if the camera's clock was set elsewhere. */
  readonly timeZone: string | undefined;
};

/**
 * Gives a JPEG the camera's own data from the original: when and where it was
 * taken, and with which camera, lens and settings. What describes the
 * original file rather than the photo stays behind.
 */
export const copyCameraData = Effect.fn('copyCameraData')(function* (
  { original, timeZone }: CameraData,
  target: string,
  extra: ReadonlyArray<string> = [],
) {
  const clock =
    timeZone === undefined
      ? []
      : clockIn(
          timeZone,
          yield* toolText('exiftool', [
            '-s3',
            '-SubSecDateTimeOriginal',
            original,
          ]),
        );
  yield* toolBytes('exiftool', [
    '-quiet',
    '-overwrite_original',
    '-TagsFromFile',
    original,
    '-EXIF:all',
    '--IFD1:all',
    '--SubIFD:all',
    '--MakerNotes:all',
    '--ThumbnailImage',
    '--PreviewImage',
    '--ImageDescription',
    '--ExifImageWidth',
    '--ExifImageHeight',
    '--Orientation',
    '-TagsFromFile',
    '@',
    // keepsake writes sRGB, whatever the camera was set to.
    '-EXIF:ColorSpace#=1',
    ...clock,
    ...extra,
    target,
  ]);
});

/** Writes a PNG or JPEG as a JPEG of high quality. */
export const toFinalJpeg = (source: string, target: string) =>
  toolBytes('magick', [source, '-strip', '-quality', quality, target]);

export type Caption = {
  readonly stars: number;
  readonly description: string;
  /** Whether an image model made it. */
  readonly ai: boolean;
};

/** Writes the finished photo with the camera's data and a caption. */
export const finish = Effect.fn('finish')(function* (
  source: string,
  camera: CameraData,
  target: string,
  caption: Caption,
) {
  yield* toFinalJpeg(source, target);
  yield* copyCameraData(camera, target, [
    '-EXIF:Software=keepsake',
    `-EXIF:ImageDescription=${caption.description}`,
    `-XMP-dc:Description=${caption.description}`,
    `-XMP-xmp:Rating=${caption.stars}`,
    ...(caption.ai
      ? [`-XMP-iptcExt:DigitalSourceType=${digitalSourceType}`]
      : []),
  ]);
});
