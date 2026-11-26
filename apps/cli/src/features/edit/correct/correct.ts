import { Effect, Schema } from 'effect';
import { wholePicture } from '../../../shared/boxes.ts';
import type { Box } from '../../../shared/domain.ts';
import { renderExactly, type Size, sizeOf } from '../../../shared/pictures.ts';
import {
  atomically,
  exists,
  readBytes,
  type ShootFiles,
} from '../../../shared/store.ts';
import type { Job } from '../best-edit.ts';
import { descriptionOf } from '../describe.ts';
import { editableSize } from '../geometry.ts';
import { ImageModel } from '../image-model.ts';
import { isOnFace, keptOnFace } from '../keep-originals.ts';
import { peopleAndSigns, remembered } from '../prepare.ts';
import { mostAttempts, versionsOf, withOriginals } from '../versions.ts';
import { candidatesOf, type Taken, writeWith } from './candidates.ts';
import { Choice, choose } from './choose.ts';
import { correctionPrompt, type ToChange } from './correction-prompt.ts';
import type { Place } from './places.ts';

const inputQuality = 95;

export type CorrectionFiles = ReturnType<ShootFiles['edit']>['correction'];

/** A change to single places of a finished photo. */
export type Correction = Pick<Job, 'open' | 'versions'> & {
  readonly files: CorrectionFiles;
  readonly places: ReadonlyArray<Place>;
  /** What the user marked, if they did; a little around it may change too. */
  readonly areas: ReadonlyArray<Box> | null;
};

/** What an attempt starts from. */
type Start = {
  readonly number: number;
  /** The picture that is changed. */
  readonly base: string;
  readonly changes: ReadonlyArray<ToChange>;
};

const inputFor = Effect.fn('inputFor')(function* (base: string, input: string) {
  const whole = yield* sizeOf(base);
  const size = editableSize(whole);
  if (!(yield* exists(input))) {
    const frame = { left: 0, top: 0, ...whole };
    yield* atomically(input, (draft) =>
      renderExactly(base, draft, { frame, size, quality: inputQuality }),
    );
  }
  return size;
});

/** What a finished photo shows, apart from what is removed from it. */
const known = Effect.fn('known')(function* (
  { open, places }: Correction,
  files: CorrectionFiles,
) {
  const gone = places.filter(({ isRemoval }) => isRemoval);
  const removed = gone.flatMap(({ what }) => what);
  const description = yield* descriptionOf(
    open.shoot,
    files,
    wholePicture,
    removed,
  );
  const kept = yield* peopleAndSigns(files, wholePicture, {
    removed,
    wish: null,
  });
  return {
    description,
    crop: wholePicture,
    originals: { ...kept, textures: [], gone: gone.map(({ box }) => box) },
  };
});
type Known = Effect.Success<ReturnType<typeof known>>;

/** Makes versions of a picture and takes the best of them at each place. */
const attempt = Effect.fn('attempt')(function* (
  { open, versions, areas }: Correction,
  files: CorrectionFiles,
  { number, base, changes }: Start,
  { size, about }: { readonly size: Size; readonly about: Known },
) {
  const numbers = yield* versionsOf(
    files,
    { number, versions },
    Effect.fn('makeVersions')(function* (count: number) {
      const image = yield* ImageModel;
      return yield* image.edit({
        picture: new Uint8Array(yield* readBytes(files.input)),
        prompt: correctionPrompt(open.shoot, about.description, changes),
        size,
        versions: count,
      });
    }),
  );
  const made = yield* Effect.forEach(numbers, (version) =>
    withOriginals(files, about, version),
  );
  const boxes = changes.map(({ place }) => place.box);
  const candidates = yield* Effect.forEach(
    candidatesOf(made.map(({ version }) => version)),
    (from, index) => {
      const file = files.candidate(number, index + 1);
      return Effect.as(
        writeWith(
          base,
          boxes.map((box) => ({ box, from })),
          file,
          areas,
        ),
        { from, file },
      );
    },
  );
  const choices = yield* remembered(
    Schema.Array(Choice),
    files.choices(number),
    choose(
      { base, candidates: candidates.map(({ file }) => file) },
      changes.map(({ place }) => place),
    ),
  );
  const taken: Array<Taken> = [];
  const left: Array<ToChange> = [];
  for (const [index, { place }] of changes.entries()) {
    const { best, notes } = choices[index] ?? { best: null, notes: '' };
    const from = best === null ? undefined : candidates[best]?.from;
    if (from === undefined) {
      left.push({ place, problem: notes });
    } else {
      taken.push({ box: place.box, from });
    }
  }
  if (taken.length === 0) {
    return { base, left, isRefused: false };
  }
  yield* writeWith(base, taken, files.result(number), areas);
  return { base: files.result(number), left, isRefused: false };
});

/**
 * Changes single places of a finished photo and leaves everything else as it
 * is. Answers with the file, or null when nothing worked, and with what didn't.
 */
export const correct = Effect.fn('correct')(function* (job: Correction) {
  const { final } = job.files;
  let base = final;
  let left: ReadonlyArray<ToChange> = job.places.map((place) => ({
    place,
    problem: null,
  }));
  let description: string | null = null;
  let attempts = 0;
  let isRefused = false;
  // Nothing is paid for what would come back with a face.
  const onFaces: Array<ToChange> = [];
  while (left.length > 0 && attempts < mostAttempts && !isRefused) {
    attempts += 1;
    const files = { ...job.files, input: job.files.inputOf(attempts) };
    const size = yield* inputFor(base, files.input);
    const about = yield* known(job, files);
    ({ description } = about);
    const { people } = about.originals;
    const isKept = ({ place }: ToChange) =>
      place.isRemoval && isOnFace(people, place.box);
    onFaces.push(
      ...left
        .filter(isKept)
        .map(({ place }): ToChange => ({ place, problem: keptOnFace })),
    );
    const start: Start = {
      number: attempts,
      base,
      changes: left.filter((change) => !isKept(change)),
    };
    const result =
      start.changes.length === 0
        ? { base, left: [], isRefused: false }
        : yield* attempt(job, files, start, { size, about }).pipe(
            Effect.catchTag('PhotoRefused', ({ message }) =>
              Effect.succeed({
                base: start.base,
                left: start.changes.map(
                  ({ place }): ToChange => ({ place, problem: message }),
                ),
                isRefused: true,
              }),
            ),
          );
    ({ base, left, isRefused } = result);
  }
  return {
    file: base === final ? null : base,
    description,
    attempts,
    left: [...left, ...onFaces],
  };
});
