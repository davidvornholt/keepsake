import { DateTime, Effect, Option, Schema } from 'effect';
import { Album, AlbumPhoto, Publication, Removed } from './domain.ts';
import {
  type Asset,
  albumAssets,
  albumNamed,
  albumWithId,
  immichServer,
} from './immich.ts';
import { isOutOf, readAllRemoved } from './standing.ts';
import { type OpenShoot, readJson, writeJson } from './store.ts';

const finishedName = /^(?<base>.+)-keepsake\.jpg$/u;

const isSame = Schema.toEquivalence(
  Schema.Struct({
    photos: Schema.Array(AlbumPhoto),
    id: Schema.String,
    name: Schema.String,
  }),
);

/** The album keepsake published to, as it is called in Immich now. */
export const publishedAlbum = (published: Publication) =>
  published.albumId === undefined
    ? albumNamed(published.album)
    : albumWithId(published.albumId);

/** Which photo of the shoot each asset of the album is, where that is known. */
const photosIn = (
  open: OpenShoot,
  published: Publication,
  assets: ReadonlyArray<Asset>,
) => {
  const photoOf = new Map(
    published.photos.map(({ asset, photo }) => [asset, photo] as const),
  );
  const byBase = new Map(
    [...open.photos.keys()].map(
      (id) => [id.slice(id.lastIndexOf('/') + 1), id] as const,
    ),
  );
  const inAlbum = new Map<string, AlbumPhoto>();
  for (const { id, fileName, favorite } of assets) {
    const base = finishedName.exec(fileName)?.groups?.base ?? '';
    const photo = photoOf.get(id) ?? byBase.get(base);
    // An outdated version may be there too until it is trashed.
    const isOutdated = !photoOf.has(id) && inAlbum.has(photo ?? '');
    if (photo !== undefined && !isOutdated) {
      inAlbum.set(photo, { photo, asset: id, favorite });
    }
  }
  return [...inAlbum.values()];
};

/**
 * Notes as taken out the photos that are gone from the album, and forgets
 * that those were taken out that are back in it.
 */
const noteRemoved = Effect.fn('noteRemoved')(function* (
  open: OpenShoot,
  published: Publication,
  album: Album,
  before: Album | null,
) {
  const all = yield* readAllRemoved(open);
  const counts = isOutOf(published.albumId);
  const there = new Set(album.photos.map(({ photo }) => photo));
  const known = new Set(
    [
      ...published.photos,
      ...(before?.id === album.id ? before.photos : []),
    ].map(({ photo }) => photo),
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
    const scope =
      published.albumId === undefined ? {} : { album: published.albumId };
    yield* writeJson(Schema.Array(Removed), open.files.removed, [
      ...all.filter((one) => !(counts(one) && there.has(one.photo))),
      ...gone.map((photo) => ({
        photo,
        at: album.readAt,
        because: null,
        ...scope,
      })),
    ]);
  }
});

/**
 * Reads what the album has in Immich now, whoever changed it there. Photos
 * that aren't in it any more are noted as taken out.
 */
export const readAlbum = Effect.fn('readAlbum')(function* (open: OpenShoot) {
  const published = yield* readJson(Publication, open.files.publication);
  if (Option.isNone(published)) {
    return null;
  }
  const found = yield* publishedAlbum(published.value);
  if (found === undefined) {
    return null;
  }
  // Asked first, so little happens between reading the album and saving it.
  const server = yield* immichServer;
  const photos = photosIn(open, published.value, yield* albumAssets(found.id));
  const album: Album = {
    id: found.id,
    name: found.name,
    server,
    readAt: DateTime.formatIso(yield* DateTime.now),
    photos,
  };
  const before = Option.getOrNull(yield* readJson(Album, open.files.album));
  yield* noteRemoved(open, published.value, album, before);
  if (before === null || !isSame(before, album)) {
    yield* writeJson(Album, open.files.album, album);
  }
  return album;
});
