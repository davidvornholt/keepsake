import { Effect } from 'effect';
import { wholePicture } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';
import { cutPng, rendered, type Size } from '../../shared/pictures.ts';
import { readBytes } from '../../shared/store.ts';
import { modelFrame } from './geometry.ts';
import { ImageModel } from './image-model.ts';

const inputQuality = 95;

type Edit = {
  /** The picture, a JPEG of the given size. */
  readonly input: string;
  readonly size: Size;
  readonly versions: number;
  /**
   * What the model is asked, for a picture that shows this part of the input.
   * It reaches beyond the input where grey is added.
   */
  readonly prompt: (shown: Box) => string;
};

/**
 * Versions of a picture from the image model, each of the picture's size. One
 * wider or taller than the model makes gets plain grey beside it, as a crop
 * beyond the photo does, and its versions lose that part again, so that all
 * of the picture is edited and nothing more is kept.
 */
export const editedVersions = Effect.fn('editedVersions')(function* ({
  input,
  size,
  versions,
  prompt,
}: Edit) {
  const image = yield* ImageModel;
  const frame = modelFrame(size);
  if (frame.width === size.width && frame.height === size.height) {
    return yield* image.edit({
      picture: new Uint8Array(yield* readBytes(input)),
      prompt: prompt(wholePicture),
      size,
      versions,
    });
  }
  const shown = {
    left: frame.left / size.width,
    top: frame.top / size.height,
    right: (frame.left + frame.width) / size.width,
    bottom: (frame.top + frame.height) / size.height,
  };
  const made = yield* image.edit({
    picture: new Uint8Array(
      yield* rendered(input, { frame, quality: inputQuality }),
    ),
    prompt: prompt(shown),
    size: { width: frame.width, height: frame.height },
    versions,
  });
  const kept = { left: -frame.left, top: -frame.top, ...size };
  return yield* Effect.forEach(made, (version) =>
    cutPng(version, { size: frame, frame: kept }),
  );
});
