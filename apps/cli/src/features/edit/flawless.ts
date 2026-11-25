import { Effect, Schema } from 'effect';
import type { Box, Outline } from '../../shared/domain.ts';
import { atomically, type EditFiles } from '../../shared/store.ts';
import { Fault, inspect } from './inspect.ts';
import { keepOriginals, type Originals } from './keep-originals.ts';
import { type Prepared, remembered } from './prepare.ts';

const Inspection = Schema.Struct({
  found: Schema.Array(Fault),
  /** What was still wrong when it was mended, or null if it wasn't. */
  left: Schema.NullOr(Schema.Array(Fault)),
});

const seriousOf = (faults: ReadonlyArray<Fault>) =>
  faults.filter(({ serious }) => serious);

const outlineOf = ({ left, top, right, bottom }: Box): Outline => [
  { x: left, y: top },
  { x: right, y: top },
  { x: right, y: bottom },
  { x: left, y: bottom },
];

/** A version with the original's people and signs, and all that is known. */
type ToCheck = {
  readonly number: number;
  readonly version: string;
  /** What was put back into the version. */
  readonly originals: Originals;
};

/** Puts back from the original what is wrong in a version. */
const mend = Effect.fn('mend')(function* (
  files: EditFiles,
  { crop }: Prepared,
  { number, originals }: ToCheck,
  faults: ReadonlyArray<Fault>,
) {
  const textures = faults.filter(({ kind }) => kind === 'texture');
  const patches = faults.filter(({ kind }) => kind !== 'texture');
  yield* atomically(files.versionMended(number), (draft) =>
    keepOriginals(
      {
        ...originals,
        bystanders: [...originals.bystanders, ...patches.map(({ box }) => box)],
        textures: [
          ...originals.textures,
          ...textures.map(({ box }) => outlineOf(box)),
        ],
      },
      crop.box,
      {
        original: files.input,
        version: files.version(number),
        target: draft,
      },
    ),
  );
});

/** Mending a fault can make another one stand out. */
const mostRounds = 2;

/** What a version shows that nobody should see, and what is left of it. */
const inspection = (files: EditFiles, prepared: Prepared, checked: ToCheck) =>
  Effect.gen(function* () {
    const about = { crop: prepared.crop.box, removed: prepared.removed };
    const mended = files.versionMended(checked.number);
    const inspected = (version: string) =>
      inspect({ original: files.input, version }, about);
    const found = yield* inspected(checked.version);
    const faults: Array<Fault> = [];
    let left: ReadonlyArray<Fault> | null = null;
    for (let round = 0; round < mostRounds; round += 1) {
      const mendable = (left ?? found).filter((fault) => fault.rightInOriginal);
      if (seriousOf(mendable).length === 0) {
        break;
      }
      // A texture is mended at no risk, and may look worse beside a mended one.
      faults.push(
        ...mendable.filter(
          ({ serious, kind }) => serious || kind === 'texture',
        ),
      );
      yield* mend(files, prepared, checked, faults);
      left = yield* inspected(mended);
    }
    return { found, left };
  });

/**
 * Looks closely at a version and puts back from the original what the image
 * model got wrong. Answers with the file, what is still wrong with it, and
 * whether the original is better there.
 */
export const flawless = Effect.fn('flawless')(function* (
  files: EditFiles,
  prepared: Prepared,
  checked: ToCheck,
) {
  const { found, left } = yield* remembered(
    Inspection,
    files.faults(checked.number),
    inspection(files, prepared, checked),
  );
  const wrong = seriousOf(left ?? found);
  return {
    file: left === null ? checked.version : files.versionMended(checked.number),
    problems: wrong.map(({ what }) => what),
    isWorse: wrong.some(({ rightInOriginal }) => rightInOriginal),
  };
});
