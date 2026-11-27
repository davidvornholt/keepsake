import { createHash } from 'node:crypto';
import { Effect, FileSystem, Option } from 'effect';
import { readAlbum, refreshAlbum } from '../../shared/album.ts';
import {
  Album,
  Publication,
  type PublishedPhoto,
} from '../../shared/domain.ts';
import {
  InvalidInput,
  StepMissing,
  StoreFailed,
} from '../../shared/errors/errors.ts';
import {
  albumAssets,
  createAlbum,
  ensureTag,
  isOwnAlbum,
  listAlbums,
  markFavorite,
  type NamedAlbum,
  signedInUser,
  stackPhotos,
  tagPhoto,
  uploadPhoto,
} from '../../shared/immich.ts';
import { withAlbum, withChoice, withPhoto } from '../../shared/lock.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { inSteps } from '../../shared/progress.ts';
import { albumsOf } from '../../shared/publication.ts';
import { isOutOf, readAllRemoved } from '../../shared/standing.ts';
import {
  exists,
  type OpenShoot,
  readBytes,
  readJson,
  readPicks,
  writeJson,
} from '../../shared/store.ts';
import { outdatedOf } from './outdated.ts';
import { takeBack } from './take-back.ts';
import {
  giveRemovalsTheirAlbum,
  knownPublication,
  type Target,
  targetOf,
} from './target.ts';

/** Marks every photo keepsake put into the library. */
const tag = 'keepsake';

type Published = PublishedPhoto;

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
    (yield* readAllRemoved(open, target.id))
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
  published: ReadonlyArray<Published>,
) {
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
      }),
    ),
  );
});

/**
 * Gives a new upload the favorite mark of the one it replaces, as Immich has
 * it now. Under the album's lock, so a favorite the page marks meanwhile
 * counts.
 */
const carryFavorite = (
  open: OpenShoot,
  album: string,
  earlier: string,
  asset: string,
) =>
  Effect.gen(function* () {
    const assets = yield* albumAssets(album);
    if (assets.some(({ id, favorite }) => id === earlier && favorite)) {
      yield* markFavorite(asset, true);
    }
  }).pipe(withAlbum(open.files));

const send = Effect.fn('send')(function* (
  open: OpenShoot,
  job: Job,
  album: string,
  /** What the album has, which stays in it. */
  there: Set<string>,
) {
  const { photo, digest, before } = job;
  const files = open.files.edit(photo);
  const asset = yield* uploadPhoto(files.final, album);
  const isReplaced = before !== undefined && before.asset !== asset;
  // A photo that isn't published whole doesn't stay in the album.
  const cameraAsset = yield* Effect.gen(function* () {
    const camera = yield* uploadPhoto(files.camera, null);
    yield* stackPhotos(asset, camera);
    yield* tagPhoto(tag, asset);
    if (isReplaced) {
      yield* carryFavorite(open, album, before.asset, asset);
    }
    return camera;
  }).pipe(
    Effect.catch((error) =>
      there.has(asset)
        ? Effect.fail(error)
        : takeBack(album, asset, error.message),
    ),
  );
  there.add(asset);
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
  const sent = {
    ...publication,
    photos: [
      ...publication.photos.filter(({ photo }) => photo !== done.photo),
      done,
    ],
  };
  const isReplaced = before !== undefined && before.asset !== done.asset;
  return {
    ...sent,
    outdated: outdatedOf({
      ...sent,
      outdated: [
        ...(sent.outdated ?? []),
        ...(isReplaced ? [before.asset] : []),
      ],
    }),
  };
};

/** The album keepsake publishes to, and whether it is the account's own. */
type Destination = {
  readonly id: string;
  readonly name: string;
  readonly owned: boolean | undefined;
};

/**
 * The publication keepsake goes on with for the album it publishes to. It
 * forgets the albums of the account's own that are gone, which were deleted,
 * so what they showed is not in use anymore.
 */
const publicationFor = (
  before: Publication | null,
  album: Destination,
  albums: ReadonlyArray<NamedAlbum>,
): Publication => {
  const records = albumsOf(before);
  const isDeleted = (albumId: string, owned: boolean | undefined) =>
    owned === true && !albums.some(({ id }) => id === albumId);
  return {
    album: album.name,
    albumId: album.id,
    ...(album.owned === undefined ? {} : { owned: album.owned }),
    photos: records.find(({ albumId }) => albumId === album.id)?.photos ?? [],
    outdated: before?.outdated ?? [],
    elsewhere: records.flatMap(({ album: name, albumId, owned, photos }) =>
      albumId === undefined || albumId === album.id || isDeleted(albumId, owned)
        ? []
        : [
            {
              album: name,
              albumId,
              ...(owned === undefined ? {} : { owned }),
              photos,
            },
          ],
    ),
  };
};

/** The album to publish to, made if it is new and may be made. */
const destinationOf = Effect.fn('destinationOf')(function* (
  target: Target,
  makesAlbum: boolean,
) {
  if (target.id === undefined && !makesAlbum) {
    return yield* new InvalidInput({
      message: `${target.name} is no longer in Immich, so nothing was published.`,
    });
  }
  if (target.id === undefined) {
    const made = yield* createAlbum(target.name);
    return { id: made.id, name: made.name, owned: true };
  }
  const { id, name } = target;
  return { id, name, owned: isOwnAlbum(target, yield* signedInUser) };
});

/**
 * What keepsake published to the target album, if it did, and what the album
 * has in Immich now.
 */
const albumNow = Effect.fn('albumNow')(function* (
  open: OpenShoot,
  before: Publication | null,
  target: Target,
) {
  const records = albumsOf(before);
  const record = records.find(
    ({ albumId }) => albumId !== undefined && albumId === target.id,
  );
  return {
    published: record?.photos ?? [],
    there:
      record === undefined
        ? null
        : yield* refreshAlbum(open, record, record === records[0]),
  };
});

/**
 * Notes the album before anything is uploaded, so that a publish that stopped
 * after it made the album finds the album by its id when run again, rather
 * than make another one. What keepsake read of another album is forgotten, so
 * nothing calls that album's photos published or marks them as favorites
 * until this one is read.
 */
const switchTo = (open: OpenShoot, publication: Publication) =>
  Effect.gen(function* () {
    // Forgotten first, so a failed removal leaves the old album current.
    const read = Option.getOrNull(yield* readJson(Album, open.files.album));
    if (read !== null && read.id !== publication.albumId) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs
        .remove(open.files.album, { force: true })
        .pipe(Effect.mapError(({ message }) => new StoreFailed({ message })));
    }
    yield* writeJson(Publication, open.files.publication, publication);
  }).pipe(withAlbum(open.files));

const publishNow = Effect.fn('publish')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  chosenAlbum: Option.Option<string>,
  makesAlbum: boolean,
) {
  const { name } = open.shoot;
  const albums = yield* listAlbums;
  const before = yield* knownPublication(open, albums);
  yield* giveRemovalsTheirAlbum(open, before?.albumId);
  const target = yield* targetOf(open, before, chosenAlbum, albums);
  const { published, there } = yield* albumNow(open, before, target);
  const inAlbum = new Set(there?.photos.map(({ photo }) => photo));
  const ready = yield* jobs(open, names, target, published);
  const todo = ready.filter(
    ({ photo, digest, before: earlier }) =>
      earlier?.digest !== digest || !inAlbum.has(photo),
  );
  const album = yield* destinationOf(target, makesAlbum);
  const uploads = new Set((yield* albumAssets(album.id)).map(({ id }) => id));
  // Replaced uploads stay noted until a command has named them, also after
  // one that fails half-way, so none is left in the album untold.
  let publication = publicationFor(before, album, albums);
  yield* switchTo(open, publication);
  yield* ensureTag(tag);
  // One at a time, and noted right away, so nothing is uploaded twice.
  const sent = yield* inSteps('publish', todo, 1, (job) =>
    Effect.gen(function* () {
      const done = yield* send(open, job, album.id, uploads);
      publication = withSent(publication, done, job.before);
      yield* writeJson(Publication, open.files.publication, publication);
      return done;
    }),
  );
  publication = { ...publication, outdated: outdatedOf(publication) };
  yield* writeJson(Publication, open.files.publication, publication);
  yield* readAlbum(open);
  return {
    shoot: name,
    album: { id: album.id, name: album.name },
    published: sent.length,
    alreadyThere: ready.length - todo.length,
    /**
     * Earlier versions, which keepsake leaves in the library. The command
     * forgets them with `forgetOutdated` once it has printed them.
     */
    outdated: publication.outdated ?? [],
  };
});

/** Uploads the picked photos, or those named, to an album in Immich. */
export const publish = (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  chosenAlbum: Option.Option<string>,
) => publishNow(open, names, chosenAlbum, true).pipe(withChoice(open.files));

/**
 * Uploads a photo to the album keepsake published to, if that is still in
 * Immich. Says whether it was: no album is made in its place.
 */
export const publishToAlbum = (open: OpenShoot, photo: string) =>
  Effect.gen(function* () {
    const albums = yield* listAlbums;
    const before = yield* knownPublication(open, albums);
    if (!albums.some(({ id }) => id === before?.albumId)) {
      return false;
    }
    yield* publishNow(open, [photo], Option.none(), false).pipe(
      withPhoto(open.files, photo),
    );
    return true;
  }).pipe(withChoice(open.files));
