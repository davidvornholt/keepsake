import { createHash } from 'node:crypto';
import { Effect, Option } from 'effect';
import { Publication } from '../../shared/domain.ts';
import { StepMissing } from '../../shared/errors/errors.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { inSteps } from '../../shared/progress.ts';
import {
  exists,
  type OpenShoot,
  readBytes,
  readJson,
  readPicks,
  writeJson,
} from '../../shared/store.ts';
import {
  albumNamed,
  ensureTag,
  stackPhotos,
  tagPhoto,
  uploadPhoto,
} from './immich.ts';

/** Marks every photo keepsake put into the library. */
const tag = 'keepsake';

type Published = Publication['photos'][number];

/** A photo that is finished but not published in this version. */
type Job = {
  readonly photo: string;
  readonly digest: string;
  readonly before: Published | undefined;
};

const digestOf = (file: string) =>
  Effect.map(readBytes(file), (bytes) =>
    createHash('sha256').update(bytes).digest('hex'),
  );

const jobs = Effect.fn('jobs')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  published: ReadonlyArray<Published>,
) {
  const photos =
    names.length === 0
      ? (yield* readPicks(open.files, open.shoot.name)).picks.map(
          ({ photo }) => photo,
        )
      : (yield* Effect.forEach(names, (name) => photoNamed(open, name))).map(
          ({ id }) => id,
        );
  const found = yield* Effect.forEach(photos, (photo) =>
    Effect.gen(function* () {
      const files = open.files.edit(photo);
      const isFinished =
        (yield* exists(files.record)) && (yield* exists(files.final));
      if (!isFinished) {
        return [];
      }
      const digest = yield* digestOf(files.final);
      const before = published.find((earlier) => earlier.photo === photo);
      return [{ photo, digest, before } satisfies Job];
    }),
  );
  return found.flat();
});

const send = Effect.fn('send')(function* (
  open: OpenShoot,
  job: Job,
  album: string,
) {
  const { photo, digest } = job;
  const files = open.files.edit(photo);
  const asset = yield* uploadPhoto(files.final, album);
  const cameraAsset = yield* uploadPhoto(files.camera, null);
  yield* stackPhotos(asset, cameraAsset);
  yield* tagPhoto(tag, asset);
  return {
    photo,
    asset,
    cameraAsset,
    digest,
  } satisfies Published;
});

/** Uploads the picked photos, or those named, to an album in Immich. */
export const publish = Effect.fn('publish')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  chosenAlbum: Option.Option<string>,
) {
  const { name } = open.shoot;
  const before = yield* readJson(Publication, open.files.publication);
  const albumName = Option.getOrElse(chosenAlbum, () =>
    Option.match(before, {
      onNone: () => open.shoot.about ?? name,
      onSome: (earlier) => earlier.album,
    }),
  );
  let published = Option.match(before, {
    onNone: (): ReadonlyArray<Published> => [],
    onSome: ({ photos }) => photos,
  });
  const ready = yield* jobs(open, names, published);
  if (ready.length === 0) {
    return yield* new StepMissing({
      message: `${names.length === 0 ? `No photo of ${name} is` : 'None of these photos is'} finished yet. Run \`keepsake edit ${[name, ...names].join(' ')}\` first.`,
    });
  }
  const todo = ready.filter((job) => job.before?.digest !== job.digest);
  const album = yield* albumNamed(albumName);
  yield* ensureTag(tag);
  // One at a time, and noted right away, so nothing is uploaded twice.
  const sent = yield* inSteps('publish', todo, 1, (job) =>
    Effect.gen(function* () {
      const done = yield* send(open, job, album.id);
      published = [
        ...published.filter(({ photo }) => photo !== done.photo),
        done,
      ];
      yield* writeJson(Publication, open.files.publication, {
        album: albumName,
        photos: published,
      });
      return done;
    }),
  );
  return {
    shoot: name,
    album: { id: album.id, name: albumName },
    published: sent.length,
    alreadyThere: ready.length - todo.length,
    /** Earlier versions, which keepsake leaves in the library. */
    outdated: todo.flatMap(({ before: earlier }) =>
      earlier === undefined ? [] : [earlier.asset],
    ),
  };
});
