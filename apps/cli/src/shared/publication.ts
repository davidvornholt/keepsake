import { Effect, Option } from 'effect';
import {
  type AdoptedPhoto,
  Album,
  Publication,
  type PublishedPhoto,
  type SendingPhoto,
} from './domain.ts';
import {
  type OpenShoot,
  readJson,
  type ShootFiles,
  shootFiles,
  shootNames,
} from './store.ts';

/**
 * What a shoot published, with the album's id taken from what it last read
 * of the album where a record from before it kept ids has none. That read is
 * of another album when a switch between albums stopped half-way, so its id
 * counts only under the same name.
 */
const readPublicationOf = Effect.fn('readPublicationOf')(function* (
  files: ShootFiles,
) {
  const published = Option.getOrNull(
    yield* readJson(Publication, files.publication),
  );
  if (published === null || published.albumId !== undefined) {
    return published;
  }
  const album = Option.getOrNull(yield* readJson(Album, files.album));
  return album === null || album.name !== published.album
    ? published
    : { ...published, albumId: album.id };
});

/** What keepsake published of the shoot, as `readPublicationOf` reads it. */
export const readPublication = (open: OpenShoot) =>
  readPublicationOf(open.files);

/** What keepsake published to one album. */
export type AlbumRecord = {
  readonly album: string;
  /** Missing only in records from before keepsake kept the album's id. */
  readonly albumId?: string | undefined;
  readonly owned?: boolean | undefined;
  readonly photos: ReadonlyArray<PublishedPhoto>;
  readonly sending?: ReadonlyArray<SendingPhoto> | undefined;
  readonly adopted?: ReadonlyArray<AdoptedPhoto> | undefined;
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
          adopted: published.adopted,
        },
        ...(published.elsewhere ?? []),
      ];

/** An upload of a photo, and whether the shoot put it into the album. */
export type Upload = {
  readonly photo: string;
  readonly asset: string;
  readonly added?: boolean | undefined;
};

/** The uploads keepsake knows to be photos of the album, and which ones. */
export const uploadsOf = (record: AlbumRecord): ReadonlyArray<Upload> => [
  ...record.photos,
  ...(record.adopted ?? []),
  ...(record.sending ?? []),
];

/**
 * Whether the shoot put the upload into the album, so it may take it out.
 * Records from before keepsake noted it put every upload there.
 */
export const isAdded = ({ added }: Upload) => added !== false;

/**
 * The assets keepsake made for the shoot, in any album, which alone it may
 * call outdated. Uploads from before it noted them count as the owner's.
 */
export const madeFor = (published: Publication | null) =>
  new Set(published?.made ?? []);

/** Whether the shoot put the asset into this album, as some photo of it. */
export const isPutInto = (
  published: Publication | null,
  albumId: string,
  asset: string,
) =>
  albumsOf(published).some(
    (record) =>
      record.albumId === albumId &&
      uploadsOf(record).some((one) => one.asset === asset && isAdded(one)),
  );

/** The camera's originals that keepsake stacked the photos on. */
const camerasOf = (record: AlbumRecord) =>
  record.photos.map(({ cameraAsset }) => cameraAsset);

/**
 * The uploads that are a photo of some album now, which are not outdated, and
 * the camera's originals of those, as Immich has a file once.
 */
export const assetsInUse = (published: Publication) =>
  new Set(
    albumsOf(published).flatMap((record) => [
      ...uploadsOf(record).map(({ asset }) => asset),
      ...camerasOf(record),
    ]),
  );

type Uploads = Pick<AlbumRecord, 'sending' | 'adopted'>;

/** Leaves out a list that is empty, as records without it have none. */
export const listed = ({ sending, adopted }: Uploads): Uploads => ({
  ...(sending === undefined || sending.length === 0 ? {} : { sending }),
  ...(adopted === undefined || adopted.length === 0 ? {} : { adopted }),
});

/**
 * Changes what is noted of the uploads still on their way to one album, or
 * taken on in it, as the album may be the current one or an earlier one.
 */
export const withUploads = (
  publication: Publication,
  albumId: string | undefined,
  change: (uploads: Uploads) => Uploads,
): Publication => {
  const changed = <R extends Uploads>(record: R) => {
    const { sending, adopted, ...rest } = record;
    return { ...rest, ...listed(change({ sending, adopted })) };
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

/** Adds to a set kept under a key. */
const addTo = <K>(
  sets: Map<K, Set<string>>,
  key: K,
  values: ReadonlyArray<string>,
) => {
  const set = sets.get(key) ?? new Set<string>();
  for (const value of values) {
    set.add(value);
  }
  sets.set(key, set);
};

/**
 * What the other shoots published, by album, since shoots of one place share
 * an album and Immich keeps a file only once. A record whose album keepsake
 * can't tell counts for every album.
 */
export const uploadsOfOthers = Effect.fn('uploadsOfOthers')(function* (
  open: OpenShoot,
) {
  const names = (yield* shootNames).filter((name) => name !== open.shoot.name);
  const records = yield* Effect.forEach(names, (name) =>
    Effect.flatMap(shootFiles(name), (files) =>
      Effect.map(readPublicationOf(files), albumsOf),
    ),
  );
  const assets = new Map<string | undefined, Set<string>>();
  const photos = new Map<string | undefined, Set<string>>();
  // The camera's originals are in no album, but may be the same file.
  const cameras = new Set(records.flat().flatMap(camerasOf));
  for (const record of records.flat()) {
    const uploads = uploadsOf(record);
    addTo(assets, record.albumId, [
      ...uploads.map(({ asset }) => asset),
      ...record.photos.flatMap(({ replaced }) => replaced ?? []),
    ]);
    addTo(
      photos,
      record.albumId,
      uploads.map(({ photo }) => photo),
    );
  }
  const has = (
    sets: Map<string | undefined, Set<string>>,
    albumId: string,
    value: string,
  ) =>
    sets.get(albumId)?.has(value) === true ||
    sets.get(undefined)?.has(value) === true;
  return {
    /** Whether another shoot published the upload in this album. */
    inAlbum: (albumId: string, asset: string) => has(assets, albumId, asset),
    /**
     * Whether another shoot published the upload in any album, or stacked a
     * photo on it as the camera's original.
     */
    anywhere: (asset: string) =>
      cameras.has(asset) || [...assets.values()].some((set) => set.has(asset)),
    /** Whether another shoot published a photo of this name in this album. */
    hasPhoto: (albumId: string, photo: string) => has(photos, albumId, photo),
  };
});
