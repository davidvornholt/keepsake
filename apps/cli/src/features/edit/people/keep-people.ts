import { Effect } from 'effect';
import type { Person } from '../../../shared/domain.ts';
import { rasterOf, sizeOf, writeRaster } from '../../../shared/pictures.ts';
import { keepPerson } from './relight.ts';

/**
 * Writes a version of a photo in which the people are the photo's own, in the
 * light the version gave them.
 */
export const keepPeople = Effect.fn('keepPeople')(function* (
  people: ReadonlyArray<Person>,
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
  yield* writeRaster(files.target, edit);
});
