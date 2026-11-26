import { createHash } from 'node:crypto';
import { Effect, type Option } from 'effect';
import { readAlbum, refreshAlbum } from '../../shared/album.ts';
import { Publication, type PublishedPhoto } from '../../shared/domain.ts';
import { StepMissing } from '../../shared/errors/errors.ts';
import {
  createAlbum,
  ensureTag,
  listAlbums,
  markFavorite,
  stackPhotos,
  tagPhoto,
  uploadPhoto,
} from '../../shared/immich.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { inSteps } from '../../shared/progress.ts';
import {
  albumsOf,
  assetsInUse,
  readPublication,
} from '../../shared/publication.ts';
import { isOutOf, readAllRemoved } from '../../shared/standing.ts';
import {
  exists,
  type OpenShoot,
  readBytes,
  readPicks,
  writeJson,
} from '../../shared/store.ts';
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
  /** Whether the upload it replaces is a favorite. */
  readonly favorite: boolean;
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

/**
 * The upload of a photo that a new one replaced and that is a photo of no
 * album keepsake knows of, as Immich gives a file that it has the same id.
 */
const outdatedOf = (publication: Publication) => {
  const inUse = assetsInUse(publication);
  return (publication.outdated ?? []).filter((asset) => !inUse.has(asset));
};

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

/** The publication keepsake goes on with for the album it publishes to. */
const publicationFor = (
  before: Publication | null,
  album: { readonly id: string; readonly name: string },
): Publication => {
  const records = albumsOf(before);
  return {
    album: album.name,
    albumId: album.id,
    photos: records.find(({ albumId }) => albumId === album.id)?.photos ?? [],
    outdated: before?.outdated ?? [],
    elsewhere: records.flatMap(({ album: name, albumId, photos }) =>
      albumId === undefined || albumId === album.id
        ? []
        : [{ album: name, albumId, photos }],
    ),
  };
};

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
 * Forgets the replaced uploads that the output of a command named, which
 * happens only once it was printed.
 */
export const forgetOutdated = Effect.fn('forgetOutdated')(function* (
  open: OpenShoot,
  named: ReadonlyArray<string>,
) {
  const publication = yield* readPublication(open);
  if (publication !== null && named.length > 0) {
    yield* writeJson(Publication, open.files.publication, {
      ...publication,
      outdated: (publication.outdated ?? []).filter(
        (asset) => !named.includes(asset),
      ),
    });
  }
});

/** Uploads the picked photos, or those named, to an album in Immich. */
export const publish = Effect.fn('publish')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  chosenAlbum: Option.Option<string>,
) {
  const { name } = open.shoot;
  const albums = yield* listAlbums;
  const before = yield* knownPublication(open, albums);
  yield* giveRemovalsTheirAlbum(open, before?.albumId);
  const target = yield* targetOf(open, before, chosenAlbum, albums);
  const { published, there } = yield* albumNow(open, before, target);
  const inAlbum = new Set(there?.photos.map(({ photo }) => photo));
  const favorites = new Set(
    there?.photos.flatMap(({ photo, favorite }) => (favorite ? [photo] : [])),
  );
  const ready = yield* jobs(open, names, target, { published, favorites });
  const todo = ready.filter(
    ({ photo, digest, before: earlier }) =>
      earlier?.digest !== digest || !inAlbum.has(photo),
  );
  const album =
    target.id === undefined
      ? yield* createAlbum(target.name)
      : { id: target.id, name: target.name };
  yield* ensureTag(tag);
  // Replaced uploads stay noted until a command has named them, also after
  // one that fails half-way, so none is left in the album untold.
  let publication = publicationFor(before, album);
  // One at a time, and noted right away, so nothing is uploaded twice.
  const sent = yield* inSteps('publish', todo, 1, (job) =>
    Effect.gen(function* () {
      const done = yield* send(open, job, album.id);
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
