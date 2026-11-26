import { createHash } from 'node:crypto';
import { Effect, Option } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { Publication } from '../../shared/domain.ts';
import { StepMissing } from '../../shared/errors/errors.ts';
import {
  albumNamed,
  albumWithId,
  createAlbum,
  ensureTag,
  markFavorite,
  stackPhotos,
  tagPhoto,
  uploadPhoto,
} from '../../shared/immich.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { inSteps } from '../../shared/progress.ts';
import { isOutOf, readAllRemoved } from '../../shared/standing.ts';
import {
  exists,
  type OpenShoot,
  readBytes,
  readJson,
  readPicks,
  writeJson,
} from '../../shared/store.ts';

/** Marks every photo keepsake put into the library. */
const tag = 'keepsake';

type Published = Publication['photos'][number];

/** The album to publish to, which has no id until it is created. */
type Target = { readonly id: string | undefined; readonly name: string };

/** A photo that is finished but not published in this version. */
type Job = {
  readonly photo: string;
  readonly digest: string;
  readonly before: Published | undefined;
  /** Whether the upload it replaces is a favorite. */
  readonly favorite: boolean;
};

const digestOf = (file: string) =>
  Effect.map(readBytes(file), (bytes) =>
    createHash('sha256').update(bytes).digest('hex'),
  );

/**
 * The album keepsake published to before, unless another is named. Albums are
 * found by their id, so one renamed in Immich stays the album, and a name is
 * looked up only for an album keepsake hasn't published to yet.
 */
const targetOf = Effect.fn('targetOf')(function* (
  open: OpenShoot,
  before: Publication | null,
  chosen: Option.Option<string>,
) {
  const recorded =
    before?.albumId === undefined
      ? undefined
      : yield* albumWithId(before.albumId);
  if (
    recorded !== undefined &&
    Option.getOrElse(chosen, () => recorded.name) === recorded.name
  ) {
    return recorded satisfies Target;
  }
  const name = Option.getOrElse(
    chosen,
    () => before?.album ?? open.shoot.about ?? open.shoot.name,
  );
  const fresh: Target = { id: undefined, name };
  return (yield* albumNamed(name)) ?? fresh;
});

/** Whether the publication is about this album. */
const isAbout = (before: Publication | null, target: Target) =>
  before !== null &&
  target.id !== undefined &&
  (before.albumId === undefined
    ? before.album === target.name
    : before.albumId === target.id);

/** The photos named, or those that were picked and not taken out since. */
const photosToSend = Effect.fn('photosToSend')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  target: Target,
) {
  if (names.length > 0) {
    const photos = yield* Effect.forEach(names, (name) =>
      photoNamed(open, name),
    );
    return photos.map(({ id }) => id);
  }
  const { picks } = yield* readPicks(open.files, open.shoot.name);
  const removed = new Set(
    (yield* readAllRemoved(open))
      .filter(isOutOf(target.id))
      .map(({ photo }) => photo),
  );
  return picks.map(({ photo }) => photo).filter((photo) => !removed.has(photo));
});

const isFinished = (open: OpenShoot, photo: string) =>
  Effect.gen(function* () {
    const files = open.files.edit(photo);
    return (yield* exists(files.record)) && (yield* exists(files.final));
  });

/**
 * The finished photos to publish. Photos named must all be finished, so
 * nothing is published of a list that can't be published whole.
 */
const jobs = Effect.fn('jobs')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  target: Target,
  album: {
    readonly published: ReadonlyArray<Published>;
    readonly favorites: ReadonlySet<string>;
  },
) {
  const { published, favorites } = album;
  const photos = yield* photosToSend(open, names, target);
  const finished = yield* Effect.filter(photos, (photo) =>
    isFinished(open, photo),
  );
  const unfinished = photos.filter((photo) => !finished.includes(photo));
  const { name } = open.shoot;
  if (finished.length === 0 || (names.length > 0 && unfinished.length > 0)) {
    return yield* new StepMissing({
      message: `${names.length === 0 ? `No photo of ${name} is` : `${unfinished.join(', ')} ${unfinished.length === 1 ? 'isn’t' : 'aren’t'}`} finished yet, so nothing was published. Run \`keepsake edit ${[name, ...(names.length > 0 ? unfinished : [])].join(' ')}\` first.`,
    });
  }
  return yield* Effect.forEach(finished, (photo) =>
    Effect.map(
      digestOf(open.files.edit(photo).final),
      (digest): Job => ({
        photo,
        digest,
        before: published.find((earlier) => earlier.photo === photo),
        favorite: favorites.has(photo),
      }),
    ),
  );
});

const send = Effect.fn('send')(function* (
  open: OpenShoot,
  job: Job,
  album: string,
) {
  const { photo, digest, before } = job;
  const files = open.files.edit(photo);
  const asset = yield* uploadPhoto(files.final, album);
  const cameraAsset = yield* uploadPhoto(files.camera, null);
  yield* stackPhotos(asset, cameraAsset);
  yield* tagPhoto(tag, asset);
  const isReplaced = before !== undefined && before.asset !== asset;
  if (isReplaced && job.favorite) {
    yield* markFavorite(asset, true);
  }
  const replaced = before === undefined ? [] : [...(before.replaced ?? [])];
  return {
    photo,
    asset,
    cameraAsset,
    digest,
    replaced: isReplaced
      ? [...replaced.filter((one) => one !== asset), before.asset]
      : replaced,
  } satisfies Published;
});

/** The publication with a photo's upload in it, and the one it replaced. */
const withSent = (
  publication: Publication,
  done: Published,
  before: Published | undefined,
): Publication => {
  const outdated = (publication.outdated ?? []).filter(
    (asset) => asset !== done.asset,
  );
  return {
    ...publication,
    photos: [
      ...publication.photos.filter(({ photo }) => photo !== done.photo),
      done,
    ],
    outdated:
      before === undefined || before.asset === done.asset
        ? outdated
        : [...outdated, before.asset],
  };
};

/** Uploads the picked photos, or those named, to an album in Immich. */
export const publish = Effect.fn('publish')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  chosenAlbum: Option.Option<string>,
) {
  const { name } = open.shoot;
  const before = Option.getOrNull(
    yield* readJson(Publication, open.files.publication),
  );
  const target = yield* targetOf(open, before, chosenAlbum);
  const isSame = isAbout(before, target);
  const there = isSame ? yield* readAlbum(open) : null;
  const inAlbum = new Set(there?.photos.map(({ photo }) => photo));
  const favorites = new Set(
    there?.photos.flatMap(({ photo, favorite }) => (favorite ? [photo] : [])),
  );
  const previous = isSame && before !== null ? before.photos : [];
  const ready = yield* jobs(open, names, target, {
    published: previous,
    favorites,
  });
  const todo = ready.filter(
    ({ photo, digest, before: earlier }) =>
      earlier?.digest !== digest || !inAlbum.has(photo),
  );
  const album =
    target.id === undefined
      ? yield* createAlbum(target.name)
      : { id: target.id, name: target.name };
  const albumId = album.id;
  yield* ensureTag(tag);
  // Replaced uploads stay noted until a publish has named them, also one that
  // fails half-way, so none is left in the album untold.
  let publication: Publication = {
    album: album.name,
    albumId,
    photos: previous,
    outdated: before?.outdated ?? [],
  };
  // One at a time, and noted right away, so nothing is uploaded twice.
  const sent = yield* inSteps('publish', todo, 1, (job) =>
    Effect.gen(function* () {
      const done = yield* send(open, job, albumId);
      publication = withSent(publication, done, job.before);
      yield* writeJson(Publication, open.files.publication, publication);
      return done;
    }),
  );
  yield* readAlbum(open);
  const outdated = publication.outdated ?? [];
  // Named now, so the next publish doesn't name them again.
  yield* writeJson(Publication, open.files.publication, {
    ...publication,
    outdated: [],
  });
  return {
    shoot: name,
    album: { id: albumId, name: album.name },
    published: sent.length,
    alreadyThere: ready.length - todo.length,
    /** Earlier versions, which keepsake leaves in the library. */
    outdated,
  };
});
