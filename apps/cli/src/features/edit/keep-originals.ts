import { Effect } from 'effect';
import type { Person, Sign } from '../../shared/domain.ts';
import { rasterOf, sizeOf, writeRaster } from '../../shared/pictures.ts';
import { keepPerson } from './people/relight.ts';
import { keepSign } from './signs/keep-sign.ts';

/** What an image model would redraw and nobody wants redrawn. */
export type Originals = {
  readonly people: ReadonlyArray<Person>;
  readonly signs: ReadonlyArray<Sign>;
};

/**
 * Writes a version of a photo in which the people and signs are the photo's
 * own, in the light the version gave them.
 */
export const keepOriginals = Effect.fn('keepOriginals')(function* (
  { people, signs }: Originals,
  files: {
    readonly original: string;
    readonly version: string;
    readonly target: string;
  },
) {
  const size = yield* sizeOf(files.original);
  const original = yield* rasterOf(files.original, size);
  const edit = yield* rasterOf(files.version, size);
  for (const person of people) {
    keepPerson(original, edit, person);
  }
  for (const sign of signs) {
    keepSign(original, edit, sign);
  }
  yield* writeRaster(files.target, edit);
});
