import { Effect, Schema } from 'effect';
import { type Box, Sign } from '../../shared/domain.ts';
import {
  atomically,
  type EditFiles,
  exists,
  writeBytes,
} from '../../shared/store.ts';
import { keepOriginals, type Originals } from './keep-originals.ts';
import { remembered } from './prepare.ts';
import { changedSigns } from './signs/changed-signs.ts';

/** A failed edit is tried once more, with what was wrong with it. */
export const mostAttempts = 2;

type Attempt = {
  readonly number: number;
  /** How many versions an attempt makes. */
  readonly versions: number;
};

/** The numbers of an attempt's versions, which are made unless they are there. */
export const versionsOf = <E, R>(
  files: EditFiles,
  { number, versions }: Attempt,
  make: Effect.Effect<ReadonlyArray<Uint8Array>, E, R>,
) =>
  Effect.gen(function* () {
    const numbers = Array.from(
      { length: versions },
      (_, index) => (number - 1) * versions + index + 1,
    );
    const isMade = (version: number) => exists(files.version(version));
    const isThere = yield* Effect.forEach(numbers, isMade);
    if (!isThere.includes(true)) {
      const made = yield* make;
      yield* Effect.forEach(numbers, (version, index) => {
        const bytes = made[index];
        return bytes === undefined
          ? Effect.void
          : writeBytes(files.version(version), bytes);
      });
    }
    return yield* Effect.filter(numbers, isMade);
  });

/** What an image model got wrong in a version, or may not redraw at all. */
const originalsFor = Effect.fn('originalsFor')(function* (
  files: EditFiles,
  originals: Originals,
  number: number,
) {
  const signs =
    originals.signs.length === 0
      ? []
      : yield* remembered(
          Schema.Array(Sign),
          files.changedSigns(number),
          changedSigns(
            { original: files.input, version: files.version(number) },
            originals.signs,
          ),
        );
  return { ...originals, signs } satisfies Originals;
});

const isNothing = ({ people, bystanders, signs, textures }: Originals) =>
  people.length + bystanders.length + signs.length + textures.length === 0;

/** A version with the original's people, textures and signs. */
export const withOriginals = Effect.fn('withOriginals')(function* (
  files: EditFiles,
  {
    crop,
    originals: all,
  }: {
    /** What the picture shows of the photo. */
    readonly crop: Box;
    readonly originals: Originals;
  },
  number: number,
) {
  const version = files.version(number);
  const originals = yield* originalsFor(files, all, number);
  if (isNothing(originals)) {
    return { number, version, originals };
  }
  const target = files.versionWithOriginals(number);
  if (!(yield* exists(target))) {
    yield* atomically(target, (draft) =>
      keepOriginals(originals, crop, {
        original: files.input,
        version,
        target: draft,
      }),
    );
  }
  return { number, version: target, originals };
});
