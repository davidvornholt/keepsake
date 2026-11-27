import type {
  Publication,
  PublishedPhoto,
  SendingPhoto,
} from '../../shared/domain.ts';
import type { NamedAlbum } from '../../shared/immich.ts';
import {
  albumsOf,
  isAdded,
  listed,
  madeFor,
  type Upload,
  withUploads,
} from '../../shared/publication.ts';
import { outdatedOf } from './outdated.ts';

// What keepsake notes of a publish as it goes, so a publish that stopped
// half-way knows what it put into the album.

/**
 * The publication with the upload of a photo's finished file that Immich
 * took, so that a publish that stops before the rest of the photo is sent
 * knows the upload, and whether it may take it back out of the album, and
 * the asset as keepsake's when Immich made it.
 */
export const withSending = (
  publication: Publication,
  sending: SendingPhoto,
  isMade: boolean,
): Publication => {
  const made = madeFor(publication);
  if (isMade) {
    made.add(sending.asset);
  }
  return {
    ...withUploads(publication, publication.albumId, (uploads) => ({
      ...uploads,
      sending: [
        ...(uploads.sending ?? []).filter(
          ({ photo }) => photo !== sending.photo,
        ),
        sending,
      ],
    })),
    ...(made.size === 0 ? {} : { made: [...made] }),
  };
};

/**
 * The publication with a photo's upload in it, and the one it replaced, which
 * is outdated if keepsake made it and put it there.
 */
export const withSent = (
  publication: Publication,
  done: PublishedPhoto,
  before: Upload | undefined,
): Publication => {
  const others = ({ photo }: { readonly photo: string }) =>
    photo !== done.photo;
  const sent = withUploads(
    {
      ...publication,
      photos: [...publication.photos.filter(others), done],
    },
    publication.albumId,
    ({ sending, adopted }) => ({
      sending: sending?.filter(others),
      adopted: adopted?.filter(others),
    }),
  );
  const isReplaced =
    before !== undefined &&
    before.asset !== done.asset &&
    isAdded(before) &&
    madeFor(publication).has(before.asset);
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
    ...listed({ sending: current?.sending, adopted: current?.adopted }),
    // A new shoot has nothing that publishes named by their file's name.
    ...(before === null || before.namesAdopted === true
      ? { namesAdopted: true }
      : {}),
    ...(before?.made === undefined ? {} : { made: before.made }),
    outdated: before?.outdated ?? [],
    elsewhere: records.flatMap(
      ({ album: name, albumId, owned, photos, sending, adopted }) =>
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
                ...listed({ sending, adopted }),
              },
            ],
    ),
  };
};
