import { createHash } from 'node:crypto';
import { Effect, FileSystem, Option } from 'effect';
import { adoptBeforeLeaving } from '../../shared/adoption.ts';
import { readAlbum, refreshAlbum } from '../../shared/album.ts';
import {
  Album,
  Publication,
  type PublishedPhoto,
  type SendingPhoto,
} from '../../shared/domain.ts';
import {
  InvalidInput,
  StepMissing,
  StoreFailed,
} from '../../shared/errors/errors.ts';
import {
  albumAssets,
  albumNameKey,
  createAlbum,
  ensureTag,
  isOwnAlbum,
  listAlbums,
  markFavorite,
  type NamedAlbum,
  signedInUser,
  stackPhotos,
  tagPhoto,
  uploadInto,
  uploadPhoto,
} from '../../shared/immich.ts';
import {
  withAlbum,
  withAlbumName,
  withChoice,
  withPhoto,
} from '../../shared/lock.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { inSteps } from '../../shared/progress.ts';
import {
  type AlbumRecord,
  albumsOf,
  isAdded,
  isPutInto,
  readPublication,
  type Upload,
} from '../../shared/publication.ts';
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
import {
  type Destination,
  publicationFor,
  withSending,
  withSent,
} from './record.ts';
import { rollBack, type Sending } from './take-back.ts';
import {
  albumOfName,
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
  /** The upload the photo is in the album now, also one taken on. */
  readonly earlier: Upload | undefined;
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
  record: AlbumRecord | undefined,
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
    Effect.map(digestOf(open.files.edit(photo).final), (digest): Job => {
      const before = record?.photos.find((one) => one.photo === photo);
      return {
        photo,
        digest,
        before,
        earlier: before ?? record?.adopted?.find((one) => one.photo === photo),
      };
    }),
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
  sending: Sending,
) {
  const { album, note } = sending;
  const { photo, digest, before, earlier } = job;
  const files = open.files.edit(photo);
  const upload = yield* uploadInto(files.final, album);
  const { asset } = upload;
  const noted = yield* readPublication(open);
  // Immich says whether this upload put the file into the album. One that it
  // found there is the shoot's when the shoot put it there before, also as
  // another photo with the same file, and otherwise the owner's or another
  // shoot's.
  const sent: SendingPhoto = {
    photo,
    asset,
    added: upload.added || isPutInto(noted, album, asset),
  };
  // What this photo put there, also in an attempt that stopped, goes back out.
  const isTakenBack =
    upload.added ||
    (noted?.sending ?? []).some(
      (one) => one.photo === photo && one.asset === asset && isAdded(one),
    );
  yield* note((publication) => withSending(publication, sent, upload.created));
  const isReplaced = earlier !== undefined && earlier.asset !== asset;
  // A photo that isn't published whole doesn't stay in the album.
  const cameraAsset = yield* Effect.gen(function* () {
    const camera = yield* uploadPhoto(files.camera, null);
    yield* stackPhotos(asset, camera);
    yield* tagPhoto(tag, asset);
    if (isReplaced) {
      yield* carryFavorite(open, album, earlier.asset, asset);
    }
    return camera;
  }).pipe(
    // Rolling back fails with what failed, and says what stays.
    Effect.tapError((error) =>
      isTakenBack ? rollBack(open, sent, sending, error.message) : Effect.void,
    ),
  );
  const replaced = (before?.replaced ?? []).filter((one) => one !== asset);
  // An upload the shoot put there stays noted, so taking the photo out takes
  // it out too. Only one keepsake made waits there for the trash.
  const isNoted = isReplaced && isAdded(earlier);
  return {
    photo,
    asset,
    cameraAsset,
    digest,
    replaced: isNoted ? [...replaced, earlier.asset] : replaced,
    added: sent.added,
  } satisfies Published;
});

/** An album that is in Immich, and whether it is the account's own. */
const existing = (album: NamedAlbum) =>
  Effect.map(
    signedInUser,
    (user): Destination => ({
      id: album.id,
      name: album.name,
      owned: isOwnAlbum(album, user),
    }),
  );

/**
 * The album to publish to, made if it is new and may be made. A new album of
 * a name is looked for again and made while no other publish does that for
 * the name, so shoots of one title that publish at once share one album.
 */
const destinationOf = Effect.fn('destinationOf')(function* (
  open: OpenShoot,
  target: Target,
  makesAlbum: boolean,
) {
  if (target.id === undefined && !makesAlbum) {
    return yield* new InvalidInput({
      message: `${target.name} is no longer in Immich, so nothing was published.`,
    });
  }
  if (target.id === undefined) {
    const { name, lookup } = target;
    return yield* Effect.gen(function* () {
      const found =
        lookup === null
          ? undefined
          : yield* albumOfName(yield* listAlbums, name, lookup);
      if (found !== undefined) {
        return yield* existing(found);
      }
      const made = yield* createAlbum(name);
      return { id: made.id, name: made.name, owned: true };
    }).pipe(withAlbumName(open.files, albumNameKey(name)));
  }
  return yield* existing(target);
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
  return record === undefined
    ? null
    : yield* refreshAlbum(open, record, record === records[0]);
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
  // What `album.json` named of an album the shoot leaves is taken on first,
  // as switching to another album forgets it.
  if (target.id !== before?.albumId) {
    yield* adoptBeforeLeaving(open, albums);
  }
  const there = yield* albumNow(open, before, target);
  // Read again, as reading the album may have taken on uploads.
  const known = yield* knownPublication(open, albums);
  const inAlbum = new Set(there?.photos.map(({ photo }) => photo));
  const record = albumsOf(known).find(
    ({ albumId }) => albumId !== undefined && albumId === target.id,
  );
  const ready = yield* jobs(open, names, target, record);
  const todo = ready.filter(
    ({ photo, digest, before: earlier }) =>
      earlier?.digest !== digest || !inAlbum.has(photo),
  );
  const album = yield* destinationOf(open, target, makesAlbum);
  // Replaced uploads stay noted until a command has named them, also after
  // one that fails half-way, so none is left in the album untold.
  let publication = publicationFor(known, album, albums);
  yield* switchTo(open, publication);
  yield* ensureTag(tag);
  // One at a time, and noted right away, so nothing is uploaded twice.
  const sent = yield* inSteps('publish', todo, 1, (job) =>
    Effect.gen(function* () {
      const done = yield* send(open, job, {
        album: album.id,
        note: (change) => {
          publication = change(publication);
          return writeJson(Publication, open.files.publication, publication);
        },
      });
      publication = withSent(publication, done, job.earlier);
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
