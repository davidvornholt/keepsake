import { Effect, FileSystem, Option } from 'effect';
import { developed } from '../../shared/develop.ts';
import {
  Crop,
  EditRecord,
  type Photo,
  type Pick,
} from '../../shared/domain.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { renderExactly, rendered, sizeOf } from '../../shared/pictures.ts';
import { starsFor } from '../../shared/stars.ts';
import {
  atomically,
  exists,
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeBytes,
  writeJson,
} from '../../shared/store.ts';
import { chooseCrop } from './crop.ts';
import { copyCameraData, finish } from './finish.ts';
import { exactFrame, outputSize } from './geometry.ts';
import { ImageModel } from './image-model.ts';
import { editPrompt } from './prompt.ts';
import { type Review, review } from './review.ts';

const cameraQuality = 95;
const inputQuality = 95;
/** A failed edit is tried once more, with what was wrong with it. */
const mostAttempts = 2;

type EditFiles = ReturnType<ShootFiles['edit']>;

export type EditOptions = {
  /** How many versions the image model makes at once. */
  readonly versions: number;
  /** Starts over, from the crop. */
  readonly again: boolean;
};

/** A picked photo with everything needed to edit it. */
type Job = {
  readonly open: OpenShoot;
  readonly pick: Pick;
  readonly photo: Photo;
  readonly files: EditFiles;
  /** The original file, which is only read. */
  readonly original: string;
  readonly versions: number;
};

const startOver = (files: EditFiles) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(files.directory, { recursive: true, force: true }).pipe(
      Effect.mapError(
        (error) =>
          new StoreFailed({
            message: `Could not remove ${files.directory}: ${error.message}`,
          }),
      ),
    );
  });

const cameraPicture = Effect.fn('cameraPicture')(function* (job: Job) {
  const { files, open, photo, original } = job;
  if (!(yield* exists(files.camera))) {
    const bytes = yield* developed(open.shoot, photo, {
      quality: cameraQuality,
    });
    yield* atomically(files.camera, (draft) =>
      Effect.andThen(writeBytes(draft, bytes), copyCameraData(original, draft)),
    );
  }
});

const cropOf = Effect.fn('cropOf')(function* (job: Job) {
  const { files, open, pick } = job;
  const before = yield* readJson(Crop, files.crop);
  if (Option.isSome(before)) {
    return before.value;
  }
  const crop = yield* chooseCrop(open.shoot, pick, files.camera);
  yield* writeJson(Crop, files.crop, crop);
  return crop;
});

/** The photo the image model gets: cropped, in the size it answers with. */
const imageInput = Effect.fn('imageInput')(function* (job: Job, crop: Crop) {
  const { files } = job;
  const size = outputSize(crop.aspect);
  if (!(yield* exists(files.input))) {
    const frame = exactFrame(crop.box, yield* sizeOf(files.camera), size);
    yield* atomically(files.input, (draft) =>
      renderExactly(files.camera, draft, {
        frame,
        size,
        quality: inputQuality,
      }),
    );
  }
  return size;
});

/** Makes versions, unless they are there from before, and reviews them. */
const attempt = Effect.fn('attempt')(function* (
  job: Job,
  crop: Crop,
  number: number,
  problems: string | null,
) {
  const { files, open, photo, pick } = job;
  const image = yield* ImageModel;
  const fs = yield* FileSystem.FileSystem;
  const size = yield* imageInput(job, crop);
  const targets = Array.from({ length: job.versions }, (_, index) =>
    files.version((number - 1) * job.versions + index + 1),
  );
  const isThere = yield* Effect.forEach(targets, exists);
  if (!isThere.includes(true)) {
    const picture = yield* fs.readFile(files.input).pipe(
      Effect.mapError(
        (error) =>
          new StoreFailed({
            message: `Could not read ${files.input}: ${error.message}`,
          }),
      ),
    );
    const versions = yield* image.edit({
      picture: new Uint8Array(picture),
      prompt: editPrompt(open.shoot, photo, pick, problems),
      size,
      versions: job.versions,
    });
    yield* Effect.forEach(targets, (target, index) => {
      const version = versions[index];
      return version === undefined ? Effect.void : writeBytes(target, version);
    });
  }
  const made = yield* Effect.filter(targets, exists);
  return yield* review(pick, crop, { original: files.input, versions: made });
});

const bestVersion = Effect.fn('bestVersion')(
  function* (job: Job, crop: Crop) {
    let last: Review = { best: null, notes: '' };
    let problems: string | null = null;
    for (let number = 1; number <= mostAttempts; number += 1) {
      last = yield* attempt(job, crop, number, problems);
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
  pick: Pick,
  photo: Photo,
  options: EditOptions,
) {
  const files = open.files.edit(photo.id);
  if (options.again) {
    yield* startOver(files);
  }
  const image = yield* ImageModel;
  const job: Job = {
    open,
    pick,
    photo,
    files,
    original: `${open.shoot.source}/${photo.file}`,
    versions: options.versions,
  };
  yield* cameraPicture(job);
  const crop = yield* cropOf(job);
  const { best, notes, attempts } = yield* bestVersion(job, crop);
  const caption = {
    stars: starsFor(pick.score),
    description: pick.description,
    ai: best !== null,
  };
  yield* atomically(files.final, (draft) =>
    Effect.gen(function* () {
      if (best !== null) {
        yield* finish(best, job.original, draft, caption);
        return;
      }
      // No version is good enough, so the camera's own picture is cropped.
      const size = yield* sizeOf(files.camera);
      const frame = exactFrame(crop.box, size, outputSize(crop.aspect));
      const cropped = yield* rendered(files.camera, {
        frame,
        quality: cameraQuality,
      });
      yield* writeBytes(draft, cropped);
      yield* finish(draft, job.original, draft, caption);
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
