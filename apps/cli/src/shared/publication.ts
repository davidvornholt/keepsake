import { Effect, Option } from 'effect';
import {
  Album,
  type FoundPhoto,
  Publication,
  type PublishedPhoto,
  type SendingPhoto,
} from './domain.ts';
import {
  type OpenShoot,
  readJson,
  shootFiles,
  shootNames,
  writeJson,
} from './store.ts';

/**
 * What keepsake published, with the album's id taken from what it last read
 * of the album where a record from before it kept ids has none. That read is
 * of another album when a switch between albums stopped half-way, so its id
 * counts only under the same name.
 */
export const readPublication = Effect.fn('readPublication')(function* (
  open: OpenShoot,
) {
  const published = Option.getOrNull(
    yield* readJson(Publication, open.files.publication),
  );
  if (published === null || published.albumId !== undefined) {
    return published;
  }
  const album = Option.getOrNull(yield* readJson(Album, open.files.album));
  return album === null || album.name !== published.album
    ? published
    : { ...published, albumId: album.id };
});

/** What keepsake published to one album. */
export type AlbumRecord = {
  readonly album: string;
  /** Missing only in records from before keepsake kept the album's id. */
  readonly albumId?: string | undefined;
  readonly owned?: boolean | undefined;
  readonly photos: ReadonlyArray<PublishedPhoto>;
  readonly sending?: ReadonlyArray<SendingPhoto> | undefined;
  readonly found?: ReadonlyArray<FoundPhoto> | undefined;
};

/** What went to each album keepsake knows of, the last one first. */
export const albumsOf = (
  published: Publication | null,
): ReadonlyArray<AlbumRecord> =>
  published === null
    ? []
    : [
        {
          album: published.album,
          albumId: published.albumId,
          owned: published.owned,
          photos: published.photos,
          sending: published.sending,
          found: published.found,
        },
        ...(published.elsewhere ?? []),
      ];

/** The uploads that are a photo of some album now, which are not outdated. */
export const assetsInUse = (published: Publication) =>
  new Set(
    albumsOf(published).flatMap((record) =>
      uploadsOf(record).map(({ asset }) => asset),
    ),
  );

/** The uploads keepsake knows to be photos of the album, and which ones. */
export const uploadsOf = (record: AlbumRecord) => [
  ...record.photos.map(({ photo, asset }) => ({ photo, asset })),
  ...(record.found ?? []),
  ...(record.sending ?? []).flatMap(({ photo, asset }) =>
    asset === undefined ? [] : [{ photo, asset }],
  ),
];

type Uploads = Pick<AlbumRecord, 'sending' | 'found'>;

/** Leaves out a list that is empty, as records without it have none. */
export const listed = ({ sending, found }: Uploads): Uploads => ({
  ...(sending === undefined || sending.length === 0 ? {} : { sending }),
  ...(found === undefined || found.length === 0 ? {} : { found }),
});

/**
 * Changes what is noted of the uploads still on their way to one album, or
 * found in it, as the album may be the current one or an earlier one.
 */
export const withUploads = (
  publication: Publication,
  albumId: string | undefined,
  change: (uploads: Uploads) => Uploads,
): Publication => {
  const changed = <R extends Uploads>(record: R) => {
    const { sending, found, ...rest } = record;
    return { ...rest, ...listed(change({ sending, found })) };
  };
  if (albumId === undefined || publication.albumId === albumId) {
    return changed(publication);
  }
  return {
    ...publication,
    elsewhere: (publication.elsewhere ?? []).map((record) =>
      record.albumId === albumId ? changed(record) : record,
    ),
  };
};

/** Notes a change to the uploads of an album in the shoot's publication. */
export const noteUploads = Effect.fn('noteUploads')(function* (
  open: OpenShoot,
  albumId: string | undefined,
  change: (uploads: Uploads) => Uploads,
) {
  const published = yield* readPublication(open);
  if (published !== null) {
    yield* writeJson(
      Publication,
      open.files.publication,
      withUploads(published, albumId, change),
    );
  }
});

/**
 * The uploads that the other shoots know as their photos, by album, since
 * shoots of one place share an album and Immich keeps a file only once.
 */
export const uploadsOfOthers = Effect.fn('uploadsOfOthers')(function* (
  open: OpenShoot,
) {
  const names = (yield* shootNames).filter((name) => name !== open.shoot.name);
  const records = yield* Effect.forEach(names, (name) =>
    Effect.gen(function* () {
      const files = yield* shootFiles(name);
      const published = yield* readJson(Publication, files.publication);
      return albumsOf(Option.getOrNull(published));
    }),
  );
  const byAlbum = new Map<string | undefined, Set<string>>();
  for (const record of records.flat()) {
    const assets = byAlbum.get(record.albumId) ?? new Set<string>();
    for (const { asset } of uploadsOf(record)) {
      assets.add(asset);
    }
    byAlbum.set(record.albumId, assets);
  }
  return {
    /** Whether another shoot knows the upload as its photo in this album. */
    inAlbum: (albumId: string, asset: string) =>
      byAlbum.get(albumId)?.has(asset) === true,
    /** Whether another shoot knows the upload as its photo anywhere. */
    anywhere: (asset: string) =>
      [...byAlbum.values()].some((assets) => assets.has(asset)),
  };
});
