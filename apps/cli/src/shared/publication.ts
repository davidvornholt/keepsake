import { Effect, Option } from 'effect';
import { Album, Publication, type PublishedPhoto } from './domain.ts';
import { type OpenShoot, readJson } from './store.ts';

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
  readonly photos: ReadonlyArray<PublishedPhoto>;
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
          photos: published.photos,
        },
        ...(published.elsewhere ?? []),
      ];

/** The uploads that are a photo of some album now, which are not outdated. */
export const assetsInUse = (published: Publication) =>
  new Set(
    albumsOf(published).flatMap(({ photos }) =>
      photos.map(({ asset }) => asset),
    ),
  );
