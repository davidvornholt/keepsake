import { DateTime, Effect, Option, Schema } from 'effect';
import { Album, AlbumPhoto, Removed } from './domain.ts';
import {
  type Asset,
  albumAssets,
  albumNamed,
  albumWithId,
  immichServer,
} from './immich.ts';
import { withAlbum } from './lock.ts';
import { type AlbumRecord, readPublication } from './publication.ts';
import { isOutOf, readAllRemoved } from './standing.ts';
import { type OpenShoot, readJson, writeJson } from './store.ts';

const isSame = Schema.toEquivalence(
  Schema.Struct({
    photos: Schema.Array(AlbumPhoto),
    id: Schema.String,
    name: Schema.String,
  }),
);

/** The album of a record, as it is called in Immich now, unless it is gone. */
const albumOf = (record: AlbumRecord) =>
  record.albumId === undefined
    ? albumNamed(record.album)
    : albumWithId(record.albumId);

/** The photos each upload is, as several photos can be the same file. */
const photosOfAssets = (
  uploads: ReadonlyArray<{ readonly photo: string; readonly asset: string }>,
) => {
  const photosOf = new Map<string, Array<string>>();
  for (const { asset, photo } of uploads) {
    photosOf.set(asset, [...(photosOf.get(asset) ?? []), photo]);
  }
  return photosOf;
};

/**
 * Which photo of the shoot each asset of the album is. Only the uploads the
 * shoot's record names count, since the album may hold other shoots' photos
 * and the owner's, whose file names can be those of this shoot's photos. An
 * upload still on its way counts for a photo that has no other in the album.
 */
const photosIn = (record: AlbumRecord, assets: ReadonlyArray<Asset>) => {
  const inAlbum = new Map<string, AlbumPhoto>();
  const add = (
    uploads: ReadonlyArray<{ readonly photo: string; readonly asset: string }>,
    isFirst: boolean,
  ) => {
    const photosOf = photosOfAssets(uploads);
    for (const { id, favorite } of assets) {
      for (const photo of photosOf.get(id) ?? []) {
        // An outdated version may be there too until it is trashed.
        if (isFirst || !inAlbum.has(photo)) {
          inAlbum.set(photo, { photo, asset: id, favorite });
        }
      }
    }
  };
  add(record.photos, true);
  add(record.sending ?? [], false);
  return [...inAlbum.values()];
};

/**
 * Notes as taken out the photos that are gone from the album, and forgets
 * that those were taken out that are back in it.
 */
const noteRemoved = Effect.fn('noteRemoved')(function* (
  open: OpenShoot,
  record: AlbumRecord,
  album: Album,
  before: Album | null,
) {
  // `publish` gives the removals from before keepsake kept album ids their
  // album before it reads another one, so the rest are about this one.
  const all = yield* readAllRemoved(open, album.id);
  const counts = isOutOf(album.id);
  const there = new Set(album.photos.map(({ photo }) => photo));
  const known = new Set(
    [...record.photos, ...(before?.id === album.id ? before.photos : [])].map(
      ({ photo }) => photo,
    ),
  );
  const gone = [...known].filter(
    (photo) =>
      !(
        there.has(photo) ||
        all.some((one) => one.photo === photo && counts(one))
      ),
  );
  const isBack = all.some((one) => counts(one) && there.has(one.photo));
  if (gone.length > 0 || isBack) {
    yield* writeJson(Schema.Array(Removed), open.files.removed, [
      ...all.filter((one) => !(counts(one) && there.has(one.photo))),
      ...gone.map((photo) => ({
        photo,
        at: album.readAt,
        because: null,
        album: album.id,
      })),
    ]);
  }
});

const refreshNow = Effect.fn('refreshAlbum')(function* (
  open: OpenShoot,
  record: AlbumRecord,
  isCurrent: boolean,
) {
  const found = yield* albumOf(record);
  if (found === undefined) {
    return null;
  }
  // Asked first, so little happens between reading the album and saving it.
  const server = yield* immichServer;
  const photos = photosIn(record, yield* albumAssets(found.id));
  const album: Album = {
    id: found.id,
    name: found.name,
    server,
    readAt: DateTime.formatIso(yield* DateTime.now),
    photos,
  };
  const before = Option.getOrNull(yield* readJson(Album, open.files.album));
  yield* noteRemoved(open, record, album, before);
  if (isCurrent && (before === null || !isSame(before, album))) {
    yield* writeJson(Album, open.files.album, album);
  }
  return album;
});

/**
 * Reads what an album keepsake published to has in Immich now, whoever
 * changed it there. Photos that aren't in it any more are noted as taken out
 * of it. Only the album keepsake publishes to is kept in `album.json`.
 */
export const refreshAlbum = (
  open: OpenShoot,
  record: AlbumRecord,
  isCurrent: boolean,
) => refreshNow(open, record, isCurrent).pipe(withAlbum(open.files));

const readNow = Effect.fn('readAlbum')(function* (open: OpenShoot) {
  const published = yield* readPublication(open);
  return published === null ? null : yield* refreshNow(open, published, true);
});

/** Reads what the album keepsake publishes to has in Immich now. */
export const readAlbum = (open: OpenShoot) =>
  readNow(open).pipe(withAlbum(open.files));
