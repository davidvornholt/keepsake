import type { Publication, PublishedPhoto } from '../../shared/domain.ts';
import type { NamedAlbum } from '../../shared/immich.ts';
import { albumsOf, listed, withUploads } from '../../shared/publication.ts';
import { outdatedOf } from './outdated.ts';

// What keepsake notes of a publish as it goes, so a publish that stopped
// half-way knows what it put into the album.

/**
 * The publication with an upload of a photo about to be sent, with the
 * SHA-256 of its file, so that a publish that stops before Immich answers
 * can find the upload by its bytes. An earlier attempt of the same file that
 * put it into the album stays noted with its asset.
 */
export const withSending = (
  publication: Publication,
  photo: string,
  digest: string,
): Publication =>
  withUploads(publication, publication.albumId, ({ sending, found }) => {
    const earlier = sending?.find((one) => one.photo === photo);
    return {
      found,
      sending: [
        ...(sending ?? []).filter((one) => one.photo !== photo),
        earlier?.digest === digest ? earlier : { photo, digest },
      ],
    };
  });

/**
 * The publication with the asset Immich gave the upload, if this publish, or
 * an earlier attempt of it, put the upload into the album. One that was in
 * the album already isn't this attempt's, so it is never taken back out.
 */
export const withSentAsset = (
  publication: Publication,
  photo: string,
  asset: string,
  isAdded: boolean,
): Publication =>
  withUploads(publication, publication.albumId, ({ sending, found }) => ({
    found,
    sending: (sending ?? []).flatMap((one) => {
      if (one.photo !== photo) {
        return [one];
      }
      return isAdded ? [{ ...one, asset }] : [];
    }),
  }));

/** The publication with a photo's upload in it, and the one it replaced. */
export const withSent = (
  publication: Publication,
  done: PublishedPhoto,
  before: PublishedPhoto | undefined,
): Publication => {
  const others = ({ photo }: { readonly photo: string }) =>
    photo !== done.photo;
  const sent = withUploads(
    {
      ...publication,
      photos: [...publication.photos.filter(others), done],
    },
    publication.albumId,
    ({ sending, found }) => ({
      sending: sending?.filter(others),
      found: found?.filter(others),
    }),
  );
  const isReplaced =
    before !== undefined &&
    before.asset !== done.asset &&
    before.wasThere !== true;
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
  const current = records.find(({ albumId }) => albumId === album.id);
  return {
    album: album.name,
    albumId: album.id,
    ...(album.owned === undefined ? {} : { owned: album.owned }),
    photos: current?.photos ?? [],
    ...listed({ sending: current?.sending, found: current?.found }),
    outdated: before?.outdated ?? [],
    elsewhere: records.flatMap(
      ({ album: name, albumId, owned, photos, sending, found }) =>
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
                ...listed({ sending, found }),
              },
            ],
    ),
  };
};
