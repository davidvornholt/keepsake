import { Effect } from 'effect';
import { wholePicture } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';
import { cutOut, rendered, type Size, sizeOf } from '../../shared/pictures.ts';
import { atomically, readBytes } from '../../shared/store.ts';
import { modelFrame } from './geometry.ts';
import { ImageModel } from './image-model.ts';
import { versionsOf } from './versions.ts';

const inputQuality = 95;

type Wanted = {
  /** The picture, a JPEG of the given size. */
  readonly input: string;
  readonly size: Size;
  /**
   * What the model is asked, for a picture that shows this part of the input.
   * It reaches beyond the input where grey is added.
   */
  readonly prompt: (shown: Box) => string;
};

const isPadded = (size: Size): boolean => {
  const frame = modelFrame(size);
  return frame.width !== size.width || frame.height !== size.height;
};

/** The versions the image model makes, at the size of its frame. */
const edited = Effect.fn('edited')(function* (
  { input, size, prompt }: Wanted,
  versions: number,
) {
  const image = yield* ImageModel;
  const frame = modelFrame(size);
  if (!isPadded(size)) {
    return yield* image.edit({
      picture: new Uint8Array(yield* readBytes(input)),
      prompt: prompt(wholePicture),
      size,
      versions,
    });
  }
  return yield* image.edit({
    picture: new Uint8Array(
      yield* rendered(input, { frame, quality: inputQuality }),
    ),
    prompt: prompt({
      left: frame.left / size.width,
      top: frame.top / size.height,
      right: (frame.left + frame.width) / size.width,
      bottom: (frame.top + frame.height) / size.height,
    }),
    size: { width: frame.width, height: frame.height },
    versions,
  });
});

/** Cuts a version back to the picture, unless it is already. */
const cutBack = Effect.fn('cutBack')(function* (version: string, size: Size) {
  if (!isPadded(size)) {
    return;
  }
  const made = yield* sizeOf(version);
  if (made.width === size.width && made.height === size.height) {
    return;
  }
  const frame = modelFrame(size);
  yield* atomically(version, (draft) =>
    cutOut(version, draft, {
      size: frame,
      frame: { left: -frame.left, top: -frame.top, ...size },
    }),
  );
});

/**
 * The numbers of an attempt's versions of a picture, made by the image model
 * unless they are there, each of the picture's size. One wider or taller than
 * the model makes gets plain grey beside it, as a crop beyond the photo does,
 * and its versions lose that part again, so that all of the picture is edited
 * and nothing more is kept. They are saved as the model made them before they
 * are cut, since they were paid for.
 */
export const pictureVersions = Effect.fn('pictureVersions')(function* (
  files: Parameters<typeof versionsOf>[0],
  attempt: Parameters<typeof versionsOf>[1],
  wanted: Wanted,
) {
  const numbers = yield* versionsOf(files, attempt, (count) =>
    edited(wanted, count),
  );
  yield* Effect.forEach(numbers, (number) =>
    cutBack(files.version(number), wanted.size),
  );
  return numbers;
});
