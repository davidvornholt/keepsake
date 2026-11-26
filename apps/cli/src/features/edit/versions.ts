import { Effect, Option, Schema } from 'effect';
import { type Box, Sign } from '../../shared/domain.ts';
import type { EditFiles } from '../../shared/edit-files.ts';
import {
  atomically,
  exists,
  readJson,
  writeBytes,
  writeJson,
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

const Batch = Schema.Array(Schema.Int);

/** The number of the first version an attempt makes. */
const firstOf = (files: EditFiles, number: number) =>
  Effect.gen(function* () {
    if (number === 1) {
      return 1;
    }
    const before = yield* readJson(Batch, files.batch(number - 1));
    const last = Option.match(before, {
      onNone: () => 0,
      onSome: (numbers) => Math.max(0, ...numbers),
    });
    return last + 1;
  });

/**
 * The numbers of an attempt's versions, which are made unless they are there.
 * Each attempt keeps the versions it has, even when a command that goes on
 * with it asks for another number, and makes those that weren't saved.
 */
export const versionsOf = <E, R>(
  files: EditFiles,
  { number, versions }: Attempt,
  make: (count: number) => Effect.Effect<ReadonlyArray<Uint8Array>, E, R>,
) =>
  Effect.gen(function* () {
    const isMade = (version: number) => exists(files.version(version));
    const recorded = yield* readJson(Batch, files.batch(number));
    if (Option.isSome(recorded)) {
      return yield* Effect.filter(recorded.value, isMade);
    }
    const first = yield* firstOf(files, number);
    const numbers = Array.from(
      { length: versions },
      (_, index) => first + index,
    );
    const missing = yield* Effect.filter(numbers, (version) =>
      Effect.map(isMade(version), (isThere) => !isThere),
    );
    if (missing.length > 0) {
      const made = yield* make(missing.length);
      yield* Effect.forEach(missing, (version, index) => {
        const bytes = made[index];
        return bytes === undefined
          ? Effect.void
          : writeBytes(files.version(version), bytes);
      });
    }
    const there = yield* Effect.filter(numbers, isMade);
    yield* writeJson(Batch, files.batch(number), there);
    return there;
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
