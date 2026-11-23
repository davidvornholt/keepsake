import { Effect } from 'effect';
import type { Sign } from '../../../shared/domain.ts';
import { rasterOf, sizeOf, writeRaster } from '../../../shared/pictures.ts';
import { keepSign } from './keep-sign.ts';

/** Writes a version of a photo in which the signs are the photo's own. */
export const keepSigns = Effect.fn('keepSigns')(function* (
  signs: ReadonlyArray<Sign>,
  files: {
    readonly original: string;
    readonly version: string;
    readonly target: string;
  },
) {
  const size = yield* sizeOf(files.original);
  const original = yield* rasterOf(files.original, size);
  const edit = yield* rasterOf(files.version, size);
  for (const sign of signs) {
    keepSign(original, edit, sign);
  }
  yield* writeRaster(files.target, edit);
});
