import { Effect } from 'effect';
import { toolBytes } from '../../shared/tools.ts';

const quality = '95';

/** IPTC's word for a photo that was edited with a trained image model. */
const digitalSourceType =
  'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';

/**
 * Gives a JPEG the camera's own data from the original: when and where it was
 * taken, and with which camera, lens and settings. What describes the
 * original file rather than the photo stays behind.
 */
export const copyCameraData = (
  original: string,
  target: string,
  extra: ReadonlyArray<string> = [],
) =>
  toolBytes('exiftool', [
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
    ...extra,
    target,
  ]);

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
  original: string,
  target: string,
  caption: Caption,
) {
  yield* toFinalJpeg(source, target);
  yield* copyCameraData(original, target, [
    '-EXIF:Software=keepsake',
    `-EXIF:ImageDescription=${caption.description}`,
    `-XMP-dc:Description=${caption.description}`,
    `-XMP-xmp:Rating=${caption.stars}`,
    ...(caption.ai
      ? [`-XMP-iptcExt:DigitalSourceType=${digitalSourceType}`]
      : []),
  ]);
});
