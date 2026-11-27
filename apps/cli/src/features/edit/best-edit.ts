import { Effect } from 'effect';
import { tidyBox } from '../../shared/boxes.ts';
import { EditRecord, type Pick } from '../../shared/domain.ts';
import { withPhoto } from '../../shared/lock.ts';
import { frameOf, rendered, sizeOf } from '../../shared/pictures.ts';
import { askReviewer } from '../../shared/review-vision.ts';
import { starsFor } from '../../shared/stars.ts';
import {
  atomically,
  readBytes,
  writeBytes,
  writeJson,
} from '../../shared/store.ts';
import { edgesBeyond } from './beyond.ts';
import { shownIn } from './describe.ts';
import { finish } from './finish.ts';
import { flawless } from './flawless.ts';
import { exactFrame } from './geometry.ts';
import { ImageModel } from './image-model.ts';
import { carriedOut, removedFrom } from './keep-originals.ts';
import {
  cameraQuality,
  type Prepared,
  prepared as preparedOf,
  remembered,
  type ToPrepare,
} from './prepare.ts';
import { editPrompt } from './prompt.ts';
import { Review, review } from './review.ts';
import { mostAttempts, versionsOf, withOriginals } from './versions.ts';

/** A picked photo with everything needed to edit it. */
export type Job = ToPrepare & {
  readonly pick: Pick;
  readonly versions: number;
};

type Attempt = {
  readonly number: number;
  /** What was wrong with the attempt before. */
  readonly problems: string | null;
};

const versionsFor = (
  { files, open, photo, pick, versions, wish }: Job,
  { crop, size, removed, description }: Prepared,
  { number, problems }: Attempt,
) =>
  versionsOf(
    files,
    { number, versions },
    Effect.fn('makeVersions')(function* (count: number) {
      const image = yield* ImageModel;
      return yield* image.edit({
        picture: new Uint8Array(yield* readBytes(files.input)),
        prompt: editPrompt({
          shoot: open.shoot,
          photo,
          pick: { ...pick, description },
          crop: crop.box,
          removed,
          wish,
          problems,
        }),
        size,
        versions: count,
      });
    }),
  );

type Outcome = {
  /** The file of the best version, or null when each has a fault. */
  readonly best: string | null;
  readonly notes: string;
};

/** Makes versions, reviews them, and looks closely at those that pass. */
const attempt = Effect.fn('attempt')(function* (
  job: Job,
  prepared: Prepared,
  which: Attempt,
) {
  const { files, wish } = job;
  const { crop, description, removed, originals } = prepared;
  const numbers = yield* versionsFor(job, prepared, which);
  const versions = yield* Effect.forEach(numbers, (number) =>
    withOriginals(files, { crop: crop.box, originals }, number),
  );
  // Kept, since it cost money, for when a later step stops the edit.
  const { good, notes } = yield* remembered(
    Review,
    files.review(which.number),
    review(
      description,
      { crop: crop.box, subject: crop.subject, removed, wish, ...originals },
      {
        original: files.input,
        versions: versions.map(({ version }) => version),
      },
    ),
  );
  const wrong: Array<string> = [];
  let acceptable: Outcome | null = null;
  for (const version of good.flatMap((index) => versions[index] ?? [])) {
    const { file, problems, isWorse } = yield* flawless(
      files,
      prepared,
      version,
      wish,
    );
    if (problems.length === 0) {
      return { best: file, notes } satisfies Outcome;
    }
    wrong.push(...problems);
    // What the camera's own picture shows as well is no reason to prefer it.
    if (!isWorse && which.number === mostAttempts) {
      acceptable ??= { best: file, notes: problems.join(' ') };
    }
  }
  const failed: Outcome = {
    best: null,
    notes: wrong.length === 0 ? notes : wrong.join(' '),
  };
  return acceptable ?? failed;
});

const bestVersion = Effect.fn('bestVersion')(
  function* (job: Job, prepared: Prepared) {
    let last: Outcome = { best: null, notes: '' };
    let problems: string | null = null;
    for (let number = 1; number <= mostAttempts; number += 1) {
      last = yield* attempt(job, prepared, { number, problems });
      if (last.best !== null) {
        return { ...last, attempts: number };
      }
      problems = last.notes;
    }
    return { ...last, attempts: mostAttempts };
  },
  Effect.catchTag('PhotoRefused', ({ message }) =>
    Effect.succeed({ best: null, notes: message, attempts: 1 }),
  ),
);

/** Crops and edits a photo, and finds the best version, if one is good. */
export const bestEdit = Effect.fn('bestEdit')(function* (job: Job) {
  const prepared = yield* preparedOf(job);
  const found = yield* askReviewer(bestVersion(job, prepared));
  return { prepared, ...found };
});

/** What a finished photo says about itself. */
export const captionOf = (
  { pick }: Job,
  description: string,
  isAi: boolean,
) => ({ stars: starsFor(pick.score), description, ai: isAi });

/** Writes the finished file and how it was made. */
export const writeEdit = Effect.fn('writeEdit')(function* (
  job: Job,
  {
    prepared: { crop, size, description, removed, originals },
    best,
    notes,
    attempts,
  }: Effect.Success<ReturnType<typeof bestEdit>>,
) {
  const { files } = job;
  const image = yield* ImageModel;
  // The camera's own picture still shows all that was to be removed, and a
  // version what was on a face.
  const gone =
    best === null ? [] : carriedOut(originals, removed).map(({ what }) => what);
  const shown =
    gone.length === removed.length
      ? description
      : yield* askReviewer(
          shownIn(
            job.open.shoot,
            files,
            { file: files.input, frame: crop.box },
            gone,
          ),
        );
  const caption = captionOf(job, shown, best !== null);
  yield* atomically(files.final, (draft) =>
    Effect.gen(function* () {
      if (best !== null) {
        yield* finish(best, job.camera, draft, caption);
        return;
      }
      // No version is good enough, so the camera's own picture is cropped, as
      // far as there is one.
      const whole = yield* sizeOf(files.camera);
      const frame =
        edgesBeyond(crop.box) === null
          ? exactFrame(crop.box, whole, size)
          : frameOf(tidyBox(crop.box), whole);
      const cropped = yield* rendered(files.camera, {
        frame,
        quality: cameraQuality,
      });
      yield* writeBytes(draft, cropped);
      yield* finish(draft, job.camera, draft, caption);
    }),
  ).pipe(withPhoto(job.open.files, job.photo.id));
  const record: EditRecord = {
    photo: job.photo.id,
    version: best === null ? 'camera' : 'ai',
    model: image.model,
    crop,
    review: notes,
    attempts,
    // Where the finished photo shows it, which can be a little moved.
    removed:
      best === null
        ? []
        : yield* removedFrom(
            { original: files.input, edit: best },
            { crop: crop.box, removals: carriedOut(originals, removed) },
          ),
  };
  yield* writeJson(EditRecord, files.record, record);
  return record;
});
