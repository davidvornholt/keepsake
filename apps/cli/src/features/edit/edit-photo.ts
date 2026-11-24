import { Effect, FileSystem, Option, Schema } from 'effect';
import { tidyBox } from '../../shared/boxes.ts';
import {
  EditRecord,
  type Photo,
  type Pick,
  Sign,
} from '../../shared/domain.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { frameOf, rendered, sizeOf } from '../../shared/pictures.ts';
import { askReviewer } from '../../shared/review-vision.ts';
import { starsFor } from '../../shared/stars.ts';
import {
  atomically,
  exists,
  type OpenShoot,
  readBytes,
  readJson,
  writeBytes,
  writeJson,
} from '../../shared/store.ts';
import { edgesBeyond } from './beyond.ts';
import { finish } from './finish.ts';
import { flawless } from './flawless.ts';
import { exactFrame } from './geometry.ts';
import { ImageModel } from './image-model.ts';
import { keepOriginals, type Originals } from './keep-originals.ts';
import {
  cameraQuality,
  type EditFiles,
  type Prepared,
  prepared as preparedOf,
  remembered,
  type ToPrepare,
  Wish,
} from './prepare.ts';
import { editPrompt } from './prompt.ts';
import { review } from './review.ts';
import { changedSigns } from './signs/changed-signs.ts';

/** A failed edit is tried once more, with what was wrong with it. */
const mostAttempts = 2;

export type EditOptions = {
  /** How many versions the image model makes at once. */
  readonly versions: number;
  /** Starts over, from the crop. */
  readonly again: boolean;
  /** What the user wants to be done, which makes the edit anew. */
  readonly wish: string | null;
};

/** A photo to edit. */
export type ToEdit = {
  readonly pick: Pick;
  readonly photo: Photo;
};

/** A picked photo with everything needed to edit it. */
type Job = ToPrepare & {
  readonly pick: Pick;
  readonly versions: number;
};

/** Removes what was made of a photo, except some files. */
const startOver = (files: EditFiles, kept: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(files.directory))) {
      return;
    }
    for (const name of yield* fs.readDirectory(files.directory)) {
      const file = `${files.directory}/${name}`;
      if (!kept.includes(file)) {
        yield* fs.remove(file, { recursive: true, force: true });
      }
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new StoreFailed({
          message: `Could not empty ${files.directory}: ${error.message}`,
        }),
    ),
  );

/** Forgets what is made anew. The camera's own picture is always kept. */
const forget = Effect.fn('forget')(function* (
  files: EditFiles,
  { again, wish }: EditOptions,
) {
  if (again) {
    yield* startOver(files, [files.camera, files.wish]);
  } else if (wish !== null) {
    yield* startOver(files, [files.camera, files.crop, files.input]);
  }
  if (wish !== null) {
    yield* writeJson(Wish, files.wish, { wish });
  }
});

/** What an image model got wrong in a version, or may not redraw at all. */
const originalsFor = Effect.fn('originalsFor')(function* (
  files: EditFiles,
  { originals }: Prepared,
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
const withOriginals = Effect.fn('withOriginals')(function* (
  files: EditFiles,
  prepared: Prepared,
  number: number,
) {
  const version = files.version(number);
  const originals = yield* originalsFor(files, prepared, number);
  if (isNothing(originals)) {
    return { number, version, originals };
  }
  const target = files.versionWithOriginals(number);
  if (!(yield* exists(target))) {
    yield* atomically(target, (draft) =>
      keepOriginals(originals, prepared.crop.box, {
        original: files.input,
        version,
        target: draft,
      }),
    );
  }
  return { number, version: target, originals };
});

type Attempt = {
  readonly number: number;
  /** What was wrong with the attempt before. */
  readonly problems: string | null;
};

/** The numbers of an attempt's versions, which are made unless they are there. */
const versionsOf = Effect.fn('versionsOf')(function* (
  job: Job,
  { crop, size, removed, wish, description }: Prepared,
  { number, problems }: Attempt,
) {
  const { files, open, photo, pick } = job;
  const image = yield* ImageModel;
  const numbers = Array.from(
    { length: job.versions },
    (_, index) => (number - 1) * job.versions + index + 1,
  );
  const isMade = (version: number) => exists(files.version(version));
  const isThere = yield* Effect.forEach(numbers, isMade);
  if (!isThere.includes(true)) {
    const versions = yield* image.edit({
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
      versions: job.versions,
    });
    yield* Effect.forEach(numbers, (version, index) => {
      const bytes = versions[index];
      return bytes === undefined
        ? Effect.void
        : writeBytes(files.version(version), bytes);
    });
  }
  return yield* Effect.filter(numbers, isMade);
});

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
  const { files } = job;
  const { crop, description, removed, wish, originals } = prepared;
  const numbers = yield* versionsOf(job, prepared, which);
  const versions = yield* Effect.forEach(numbers, (number) =>
    withOriginals(files, prepared, number),
  );
  const { good, notes } = yield* review(
    description,
    { crop: crop.box, subject: crop.subject, removed, wish, ...originals },
    {
      original: files.input,
      versions: versions.map(({ version }) => version),
    },
  );
  const wrong: Array<string> = [];
  let acceptable: Outcome | null = null;
  for (const version of good.flatMap((index) => versions[index] ?? [])) {
    const { file, problems, isWorse } = yield* flawless(
      files,
      prepared,
      version,
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

/** How a photo was edited, if it has been. */
export const editOf = Effect.fn('editOf')(function* (
  open: OpenShoot,
  photo: string,
) {
  const files = open.files.edit(photo);
  return (yield* exists(files.final))
    ? yield* readJson(EditRecord, files.record)
    : Option.none<EditRecord>();
});

/** Crops, edits and reviews one photo and writes the finished file. */
export const editPhoto = Effect.fn('editPhoto')(function* (
  open: OpenShoot,
  { pick, photo }: ToEdit,
  options: EditOptions,
) {
  const files = open.files.edit(photo.id);
  yield* forget(files, options);
  const image = yield* ImageModel;
  const job: Job = {
    open,
    pick,
    photo,
    files,
    camera: {
      original: `${open.shoot.source}/${photo.file}`,
      timeZone: open.shoot.timeZone,
    },
    description: pick.description,
    versions: options.versions,
  };
  const prepared = yield* preparedOf(job);
  const { crop, size, description } = prepared;
  const { best, notes, attempts } = yield* askReviewer(
    bestVersion(job, prepared),
  );
  const caption = {
    stars: starsFor(pick.score),
    description,
    ai: best !== null,
  };
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
  );
  const record: EditRecord = {
    photo: photo.id,
    version: best === null ? 'camera' : 'ai',
    model: image.model,
    crop,
    review: notes,
    attempts,
  };
  yield* writeJson(EditRecord, files.record, record);
  return record;
});
