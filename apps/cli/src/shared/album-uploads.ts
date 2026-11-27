import { createHash } from 'node:crypto';
import { Effect, FileSystem, Option, Path } from 'effect';
import type { Album, FoundPhoto } from './domain.ts';
import { type Asset, downloadOriginal } from './immich.ts';
import {
  type AlbumRecord,
  noteUploads,
  uploadsOf,
  uploadsOfOthers,
} from './publication.ts';
import { exists, type OpenShoot, readBytes } from './store.ts';

// Which uploads in an album are the shoot's, where its record doesn't say
// yet: one a publish sent just before it stopped, and those that publishes
// from before keepsake noted every upload put there. Shoots of one place
// share an album, and their files can have the same names, so an upload is
// the shoot's only when its bytes are those of the shoot's file.

const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** The SHA-256 of what Immich keeps of an upload, unless it can't be had. */
const digestOfUpload = (asset: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: 'keepsake-',
    });
    yield* downloadOriginal(asset, directory);
    const [file] = yield* fs.readDirectory(directory);
    return file === undefined
      ? Option.none<string>()
      : Option.some(sha256(yield* readBytes(path.join(directory, file))));
  }).pipe(
    Effect.scoped,
    Effect.catch(() => Effect.succeedNone),
  );

/** The SHA-256 of every finished file the photo had, now and before. */
const finishedDigests = Effect.fn('finishedDigests')(function* (
  open: OpenShoot,
  photo: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = open.files.edit(photo);
  const earlier = (yield* exists(files.earlier))
    ? (yield* fs.readDirectory(files.earlier)).map((name) =>
        path.join(files.earlier, name),
      )
    : [];
  const all = yield* Effect.filter([files.final, ...earlier], exists);
  const digests = yield* Effect.forEach(all, (file) =>
    Effect.map(readBytes(file), sha256),
  );
  return new Set(digests);
});

/** The uploads the record knows, also those that newer ones replaced. */
const knownAssets = (record: AlbumRecord) =>
  new Set([
    ...uploadsOf(record).map(({ asset }) => asset),
    ...record.photos.flatMap(({ replaced }) => replaced ?? []),
  ]);

/**
 * Finds the uploads a publish sent without learning their asset, as it
 * stopped before Immich answered: the upload in the album of the file's name
 * whose bytes are those it sent.
 */
const sentUploads = Effect.fn('sentUploads')(function* (
  open: OpenShoot,
  record: AlbumRecord,
  assets: ReadonlyArray<Asset>,
  isFree: (asset: string) => boolean,
) {
  const path = yield* Path.Path;
  const waiting = (record.sending ?? []).filter(
    ({ asset }) => asset === undefined,
  );
  return yield* Effect.forEach(waiting, (sending) =>
    Effect.gen(function* () {
      const name = path.basename(open.files.edit(sending.photo).final);
      const candidates = assets.filter(
        ({ id, fileName }) => fileName === name && isFree(id),
      );
      for (const { id } of candidates) {
        const digest = yield* digestOfUpload(id);
        if (Option.getOrNull(digest) === sending.digest) {
          return { ...sending, asset: id };
        }
      }
      return sending;
    }),
  );
});

/**
 * Finds the uploads that `album.json` called the shoot's photos although its
 * record doesn't know them, as publishes from before keepsake noted every
 * upload found them by their file's name: each is the photo's only if its
 * bytes are those of one of the photo's finished files.
 */
const foundUploads = Effect.fn('foundUploads')(function* (
  open: OpenShoot,
  before: Album,
  isFree: (asset: string) => boolean,
) {
  const verified = yield* Effect.forEach(before.photos, ({ photo, asset }) =>
    Effect.gen(function* () {
      if (!(isFree(asset) && open.photos.has(photo))) {
        return [];
      }
      const digest = Option.getOrNull(yield* digestOfUpload(asset));
      const digests = yield* finishedDigests(open, photo);
      return digest !== null && digests.has(digest)
        ? [{ photo, asset } satisfies FoundPhoto]
        : [];
    }),
  );
  return verified.flat();
});

/**
 * The record with the uploads it didn't know yet that are the shoot's, which
 * are noted in its publication, so each is looked into only once.
 */
export const reconcileUploads = Effect.fn('reconcileUploads')(function* (
  open: OpenShoot,
  record: AlbumRecord,
  {
    albumId,
    assets,
    before,
  }: {
    readonly albumId: string;
    /** What the album has in Immich now. */
    readonly assets: ReadonlyArray<Asset>;
    /** What `album.json` said the album had. */
    readonly before: Album | null;
  },
) {
  const known = knownAssets(record);
  const isWaiting = (record.sending ?? []).some(
    ({ asset }) => asset === undefined,
  );
  const legacy =
    before?.id === albumId
      ? before.photos.filter(({ asset }) => !known.has(asset))
      : [];
  if (!isWaiting && legacy.length === 0) {
    return record;
  }
  const others = yield* uploadsOfOthers(open);
  const isFree = (asset: string) =>
    !(known.has(asset) || others.inAlbum(albumId, asset));
  const sending = yield* sentUploads(open, record, assets, isFree);
  const found =
    before === null
      ? []
      : yield* foundUploads(open, { ...before, photos: legacy }, isFree);
  const updated = {
    sending,
    found: [...(record.found ?? []), ...found],
  };
  yield* noteUploads(open, albumId, () => updated);
  return { ...record, ...updated };
});
