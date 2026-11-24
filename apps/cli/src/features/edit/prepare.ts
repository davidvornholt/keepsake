import { Effect, Option, Schema } from 'effect';
import { wholePicture } from '../../shared/boxes.ts';
import { developed } from '../../shared/develop.ts';
import {
  Box,
  Crop,
  Outline,
  Person,
  type Photo,
  Removal,
  Sign,
} from '../../shared/domain.ts';
import { renderExactly, type Size, sizeOf } from '../../shared/pictures.ts';
import { askReviewer } from '../../shared/review-vision.ts';
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
import { descriptionOf } from './describe.ts';
import { type CameraData, copyCameraData } from './finish.ts';
import { exactFrame, outputSize, within } from './geometry.ts';
import type { Originals } from './keep-originals.ts';
import { findBystanders } from './people/find-bystanders.ts';
import { findPeople } from './people/find-people.ts';
import { findRemovals } from './removals.ts';
import { findSigns } from './signs/find-signs.ts';
import { findTextures } from './textures/find-textures.ts';

export const cameraQuality = 95;
const inputQuality = 95;

export type EditFiles = ReturnType<ShootFiles['edit']>;

/** A photo with everything needed to prepare its edit. */
export type ToPrepare = {
  readonly open: OpenShoot;
  readonly photo: Photo;
  readonly files: EditFiles;
  readonly camera: CameraData;
  /** What the photo shows, for framing it. */
  readonly description: string;
};

/** What is known about a photo before the image model gets it. */
export type Prepared = {
  readonly crop: Crop;
  readonly size: Size;
  readonly wish: string | null;
  /** What is removed from the photo. */
  readonly removed: ReadonlyArray<string>;
  /** What the finished photo shows. */
  readonly description: string;
  readonly originals: Originals;
};

/** What the user wants to be done with a photo. */
export const Wish = Schema.Struct({ wish: Schema.String });

/** What was found out before, or else what is found out now. */
export const remembered = <S extends Schema.Constraint, E, R>(
  schema: S,
  file: string,
  find: Effect.Effect<S['Type'], E, R>,
) =>
  Effect.gen(function* () {
    const before = yield* readJson(schema, file);
    if (Option.isSome(before)) {
      return before.value;
    }
    const found = yield* find;
    yield* writeJson(schema, file, found);
    return found;
  });

const cameraPicture = Effect.fn('cameraPicture')(function* (job: ToPrepare) {
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

/** The photo the image model gets: cropped, in the size it answers with. */
const imageInput = Effect.fn('imageInput')(function* (
  files: EditFiles,
  crop: Crop,
) {
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

const originalsOf = Effect.fn('originalsOf')(function* (
  files: EditFiles,
  crop: Crop,
  removals: ReadonlyArray<Removal>,
) {
  const removed = removals.map(({ what }) => what);
  const people = yield* remembered(
    Schema.Array(Person),
    files.people,
    findPeople(files.input, within(wholePicture, crop.box), removed),
  );
  const bystanders = yield* remembered(
    Schema.Array(Box),
    files.bystanders,
    findBystanders(files.input, people, removed),
  );
  const signs = yield* remembered(
    Schema.Array(Sign),
    files.signs,
    findSigns(files.input, removed),
  );
  const textures = yield* remembered(
    Schema.Array(Outline),
    files.textures,
    findTextures(files.input, removed),
  );
  const gone = removals.map(({ box }) => box);
  return { people, bystanders, signs, textures, gone } satisfies Originals;
});

/** Frames a photo and finds out what is in it and what isn't to stay. */
export const prepared = Effect.fn('prepared')(function* (job: ToPrepare) {
  const { open, photo, files } = job;
  yield* cameraPicture(job);
  const wish = Option.match(yield* readJson(Wish, files.wish), {
    onNone: () => null,
    onSome: (known) => (known.wish === '' ? null : known.wish),
  });
  const crop = yield* remembered(
    Crop,
    files.crop,
    chooseCrop(open.shoot, files.camera, { ...job, wish }),
  );
  const size = yield* imageInput(files, crop);
  return yield* askReviewer(
    Effect.gen(function* () {
      const removals = yield* remembered(
        Schema.Array(Removal),
        files.removals,
        findRemovals(files.input, crop.box, wish),
      );
      const removed = removals.map(({ what }) => what);
      const description = yield* descriptionOf(
        open,
        photo.id,
        crop.box,
        removed,
      );
      const originals = yield* originalsOf(files, crop, removals);
      return {
        crop,
        size,
        wish,
        removed,
        description,
        originals,
      } satisfies Prepared;
    }),
  );
});
