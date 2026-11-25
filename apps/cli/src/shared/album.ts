import { DateTime, Effect, Option, Schema } from 'effect';
import { Album, AlbumPhoto, Publication, Removed } from './domain.ts';
import { albumAssets, findAlbum, immichServer } from './immich.ts';
import { readRemoved } from './standing.ts';
import { type OpenShoot, readJson, writeJson } from './store.ts';

const finishedName = /^(?<base>.+)-keepsake\.jpg$/u;

const isSame = Schema.toEquivalence(
  Schema.Struct({
    photos: Schema.Array(AlbumPhoto),
    name: Schema.String,
  }),
);

/**
 * Reads what the album has in Immich now, whoever changed it there. Photos
 * that aren't in it any more are noted as taken out.
 */
export const readAlbum = Effect.fn('readAlbum')(function* (open: OpenShoot) {
  const published = yield* readJson(Publication, open.files.publication);
  if (Option.isNone(published)) {
    return null;
  }
  const found = yield* findAlbum(published.value.album);
  if (found === undefined) {
    return null;
  }
  // Asked first, so little happens between reading the album and saving it.
  const server = yield* immichServer;
  const photoOf = new Map(
    published.value.photos.map(({ asset, photo }) => [asset, photo] as const),
  );
  const byBase = new Map(
    [...open.photos.keys()].map(
      (id) => [id.slice(id.lastIndexOf('/') + 1), id] as const,
    ),
  );
  const inAlbum = new Map<string, AlbumPhoto>();
  for (const { id, fileName, favorite } of yield* albumAssets(found.id)) {
    const base = finishedName.exec(fileName)?.groups?.base ?? '';
    const photo = photoOf.get(id) ?? byBase.get(base);
    // An outdated version may be there too until it is trashed.
    const isOutdated = !photoOf.has(id) && inAlbum.has(photo ?? '');
    if (photo !== undefined && !isOutdated) {
      inAlbum.set(photo, { photo, asset: id, favorite });
    }
  }
  const photos = [...inAlbum.values()];
  const readAt = DateTime.formatIso(yield* DateTime.now);
  const album: Album = {
    id: found.id,
    name: found.name,
    server,
    readAt,
    photos,
  };
  const before = Option.getOrNull(yield* readJson(Album, open.files.album));
  const removed = yield* readRemoved(open);
  const there = new Set(photos.map(({ photo }) => photo));
  const known = new Set(
    [...published.value.photos, ...(before?.photos ?? [])].map(
      ({ photo }) => photo,
    ),
  );
  const gone = [...known].filter(
    (photo) =>
      !(there.has(photo) || removed.some((one) => one.photo === photo)),
  );
  const isBack = removed.some(({ photo }) => there.has(photo));
  if (gone.length > 0 || isBack) {
    yield* writeJson(Schema.Array(Removed), open.files.removed, [
      ...removed.filter(({ photo }) => !there.has(photo)),
      ...gone.map((photo) => ({ photo, at: readAt, because: null })),
    ]);
  }
  if (before === null || !isSame(before, album)) {
    yield* writeJson(Album, open.files.album, album);
  }
  return album;
});
