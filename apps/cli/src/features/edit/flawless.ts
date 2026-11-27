import { Effect, Schema } from 'effect';
import type { Box, Outline } from '../../shared/domain.ts';
import type { EditFiles } from '../../shared/edit-files.ts';
import { atomically } from '../../shared/store.ts';
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
      originals,
      crop.box,
      {
        original: files.input,
        version: files.version(number),
        target: draft,
      },
      // Where the edit shows them, which the inspection looked at.
      {
        patches: patches.map(({ box }) => box),
        textures: textures.map(({ box }) => outlineOf(box)),
      },
    ),
  );
});

/** Mending a fault can make another one stand out. */
const mostRounds = 2;

/** What a version shows that nobody should see, and what is left of it. */
const inspection = (
  files: EditFiles,
  prepared: Prepared,
  checked: ToCheck,
  wish: string | null,
) =>
  Effect.gen(function* () {
    const about = { crop: prepared.crop.box, removed: prepared.removed, wish };
    const mended = files.versionMended(checked.number);
    // Each answer is kept, since it cost money, for when a later one fails.
    const inspected = (version: string, round: number) =>
      remembered(
        Schema.Array(Fault),
        files.inspection(checked.number, round),
        inspect({ original: files.input, version }, about),
      );
    const found = yield* inspected(checked.version, 0);
    const faults: Array<Fault> = [];
    let left: ReadonlyArray<Fault> | null = null;
    for (let round = 0; round < mostRounds; round += 1) {
      // Also what few would notice, such as a small bird that became a lump:
      // the original's own pixels are right there, at no risk.
      const mendable = (left ?? found).filter((fault) => fault.rightInOriginal);
      if (mendable.length === 0) {
        break;
      }
      faults.push(...mendable);
      yield* mend(files, prepared, checked, faults);
      left = yield* inspected(mended, round + 1);
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
  /** What the user wants to be done. */
  wish: string | null,
) {
  const { found, left } = yield* remembered(
    Inspection,
    files.faults(checked.number),
    inspection(files, prepared, checked, wish),
  );
  const wrong = seriousOf(left ?? found);
  return {
    file: left === null ? checked.version : files.versionMended(checked.number),
    problems: wrong.map(({ what }) => what),
    isWorse: wrong.some(({ inOriginal }) => !inOriginal),
  };
});
