import { Effect, FileSystem, Option, Schema } from 'effect';
import { tidyBox, wholePicture } from '../../shared/boxes.ts';
import { developed } from '../../shared/develop.ts';
import {
  Crop,
  EditRecord,
  Person,
  type Photo,
  type Pick,
  Sign,
} from '../../shared/domain.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import {
  frameOf,
  renderExactly,
  rendered,
  type Size,
  sizeOf,
} from '../../shared/pictures.ts';
import { starsFor } from '../../shared/stars.ts';
import {
  atomically,
  exists,
  type OpenShoot,
  readBytes,
  readJson,
  type ShootFiles,
  writeBytes,
  writeJson,
} from '../../shared/store.ts';
import { edgesBeyond } from './beyond.ts';
import { chooseCrop } from './crop.ts';
import { type CameraData, copyCameraData, finish } from './finish.ts';
import { exactFrame, outputSize, within } from './geometry.ts';
import { ImageModel } from './image-model.ts';
import { keepOriginals, type Originals } from './keep-originals.ts';
import { findPeople } from './people/find-people.ts';
import { editPrompt } from './prompt.ts';
import { type Review, review } from './review.ts';
import { findSigns } from './signs/find-signs.ts';

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
  readonly camera: CameraData;
  readonly versions: number;
};

/** Removes what was made of the camera's picture, but not the picture. */
const startOver = (files: EditFiles) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(files.directory))) {
      return;
    }
    for (const name of yield* fs.readDirectory(files.directory)) {
      const file = `${files.directory}/${name}`;
      if (file !== files.camera) {
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

const cameraPicture = Effect.fn('cameraPicture')(function* (job: Job) {
  const { files, open, photo, camera } = job;
  if (!(yield* exists(files.camera))) {
    const bytes = yield* developed(open.shoot, photo, {
      quality: cameraQuality,
    });
    yield* atomically(files.camera, (draft) =>
      Effect.andThen(writeBytes(draft, bytes), copyCameraData(camera, draft)),
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

const peopleOf = Effect.fn('peopleOf')(function* ({ files }: Job, crop: Crop) {
  const people = Schema.Array(Person);
  const before = yield* readJson(people, files.people);
  if (Option.isSome(before)) {
    return before.value;
  }
  const found = yield* findPeople(files.input, within(wholePicture, crop.box));
  yield* writeJson(people, files.people, found);
  return found;
});

const signsOf = Effect.fn('signsOf')(function* ({ files }: Job) {
  const signs = Schema.Array(Sign);
  const before = yield* readJson(signs, files.signs);
  if (Option.isSome(before)) {
    return before.value;
  }
  const found = yield* findSigns(files.input);
  yield* writeJson(signs, files.signs, found);
  return found;
});

/** What is known about a photo before the image model gets it. */
type Prepared = {
  readonly crop: Crop;
  readonly size: Size;
  readonly originals: Originals;
};

/** A version with the original's people and signs. */
const withOriginals = Effect.fn('withOriginals')(function* (
  { files }: Job,
  originals: Originals,
  number: number,
) {
  const version = files.version(number);
  if (originals.people.length + originals.signs.length === 0) {
    return version;
  }
  const target = files.versionWithOriginals(number);
  if (!(yield* exists(target))) {
    yield* atomically(target, (draft) =>
      keepOriginals(originals, {
        original: files.input,
        version,
        target: draft,
      }),
    );
  }
  return target;
});

/** Makes versions, unless they are there from before, and reviews them. */
const attempt = Effect.fn('attempt')(function* (
  job: Job,
  { crop, size, originals }: Prepared,
  number: number,
  problems: string | null,
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
        pick,
        crop: crop.box,
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
  const made = yield* Effect.filter(numbers, isMade);
  const versions = yield* Effect.forEach(made, (version) =>
    withOriginals(job, originals, version),
  );
  return yield* review(
    pick,
    { crop: crop.box, subject: crop.subject, ...originals },
    { original: files.input, versions },
  );
});

const bestVersion = Effect.fn('bestVersion')(
  function* (job: Job, prepared: Prepared) {
    let last: Review = { best: null, notes: '' };
    let problems: string | null = null;
    for (let number = 1; number <= mostAttempts; number += 1) {
      last = yield* attempt(job, prepared, number, problems);
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
    camera: {
      original: `${open.shoot.source}/${photo.file}`,
      timeZone: open.shoot.timeZone,
    },
    versions: options.versions,
  };
  yield* cameraPicture(job);
  const crop = yield* cropOf(job);
  const size = yield* imageInput(job, crop);
  const originals = {
    people: yield* peopleOf(job, crop),
    signs: yield* signsOf(job),
  };
  const { best, notes, attempts } = yield* bestVersion(job, {
    crop,
    size,
    originals,
  });
  const caption = {
    stars: starsFor(pick.score),
    description: pick.description,
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
