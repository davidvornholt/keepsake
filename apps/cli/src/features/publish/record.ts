import type { Publication, PublishedPhoto } from '../../shared/domain.ts';
import type { NamedAlbum } from '../../shared/immich.ts';
import { type AlbumRecord, albumsOf } from '../../shared/publication.ts';
import { outdatedOf } from './outdated.ts';

// What keepsake notes of a publish as it goes, so a publish that stopped
// half-way knows what it put into the album.

/**
 * The publication with an upload of a photo in the album, so that it counts
 * as the photo's even when the rest of the photo is never sent.
 */
export const withSending = (
  publication: Publication,
  photo: string,
  asset: string,
): Publication => ({
  ...publication,
  sending: [
    ...(publication.sending ?? []).filter((one) => one.photo !== photo),
    { photo, asset },
  ],
});

/** The publication with a photo's upload in it, and the one it replaced. */
export const withSent = (
  publication: Publication,
  done: PublishedPhoto,
  before: PublishedPhoto | undefined,
): Publication => {
  const { sending, ...rest } = publication;
  const stillSending = (sending ?? []).filter(
    ({ photo }) => photo !== done.photo,
  );
  const sent = {
    ...rest,
    ...(stillSending.length === 0 ? {} : { sending: stillSending }),
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

/** The album keepsake publishes to, and whether it is the account's own. */
export type Destination = {
  readonly id: string;
  readonly name: string;
  readonly owned: boolean | undefined;
};

/**
 * The publication keepsake goes on with for the album it publishes to. It
 * forgets the albums of the account's own that are gone, which were deleted,
 * so what they showed is not in use anymore.
 */
export const publicationFor = (
  before: Publication | null,
  album: Destination,
  albums: ReadonlyArray<NamedAlbum>,
): Publication => {
  const records = albumsOf(before);
  const isDeleted = (albumId: string, owned: boolean | undefined) =>
    owned === true && !albums.some(({ id }) => id === albumId);
  const sendingOf = (sending: AlbumRecord['sending']) =>
    sending === undefined || sending.length === 0 ? {} : { sending };
  const current = records.find(({ albumId }) => albumId === album.id);
  return {
    album: album.name,
    albumId: album.id,
    ...(album.owned === undefined ? {} : { owned: album.owned }),
    photos: current?.photos ?? [],
    ...sendingOf(current?.sending),
    outdated: before?.outdated ?? [],
    elsewhere: records.flatMap(
      ({ album: name, albumId, owned, photos, sending }) =>
        albumId === undefined ||
        albumId === album.id ||
        isDeleted(albumId, owned)
          ? []
          : [
              {
                album: name,
                albumId,
                ...(owned === undefined ? {} : { owned }),
                photos,
                ...sendingOf(sending),
              },
            ],
    ),
  };
};
