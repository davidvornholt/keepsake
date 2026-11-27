import { Effect, Path } from 'effect';
import { type Album, Publication } from './domain.ts';
import type { Asset } from './immich.ts';
import {
  type AlbumRecord,
  readPublication,
  uploadsOf,
  uploadsOfOthers,
  withUploads,
} from './publication.ts';
import { type OpenShoot, writeJson } from './store.ts';

// Publishes from before keepsake noted every upload found the shoot's photos
// in the album by their file's name, and `album.json` kept what they found.
// Those uploads are taken on once, by the same name, where nothing else in
// the album may be the photo; after that, nothing is found by name, so a
// photo taken out of the album stays out.

/**
 * The record with the uploads `album.json` named by their file's name taken
 * on, noted in the shoot's publication together with that it was done. An
 * upload is taken on when it is in the album now as `<photo>-keepsake.jpg`,
 * the shoot has that photo, and no other shoot published a photo of that
 * name, or that upload, to the album.
 */
export const adoptNamed = Effect.fn('adoptNamed')(function* (
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
  const published = yield* readPublication(open);
  if (
    published === null ||
    published.namesAdopted === true ||
    published.albumId !== albumId
  ) {
    return record;
  }
  const path = yield* Path.Path;
  const known = uploadsOf(record);
  const isKnown = ({ photo, asset }: { photo: string; asset: string }) =>
    known.some((one) => one.photo === photo || one.asset === asset);
  const fileOf = new Map(assets.map(({ id, fileName }) => [id, fileName]));
  const named = (before?.id === albumId ? before.photos : []).filter(
    (one) =>
      !isKnown(one) &&
      open.photos.has(one.photo) &&
      fileOf.get(one.asset) === path.basename(open.files.edit(one.photo).final),
  );
  const others = named.length === 0 ? null : yield* uploadsOfOthers(open);
  const adopted = [
    ...(record.adopted ?? []),
    ...named.flatMap(({ photo, asset }) =>
      others?.hasPhoto(albumId, photo) === true ||
      others?.inAlbum(albumId, asset) === true
        ? []
        : [{ photo, asset }],
    ),
  ];
  yield* writeJson(Publication, open.files.publication, {
    ...withUploads(published, albumId, ({ sending }) => ({
      sending,
      adopted,
    })),
    namesAdopted: true,
  });
  return { ...record, adopted };
});
