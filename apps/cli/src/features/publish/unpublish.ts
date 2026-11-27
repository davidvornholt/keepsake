import { Effect } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { Publication, type PublishedPhoto } from '../../shared/domain.ts';
import { ToolFailed } from '../../shared/errors/errors.ts';
import { removeFromAlbum } from '../../shared/immich.ts';
import { withChoice } from '../../shared/lock.ts';
import {
  assetsInUse,
  isAdded,
  isCreated,
  readPublication,
  uploadsOfOthers,
} from '../../shared/publication.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';

/**
 * Takes a photo that was just published back out of the album, and lets
 * what keepsake published of it be what it was before. An upload that is
 * also another photo's stays in the album, and a new one stays in the
 * library, noted as outdated.
 */
export const unpublish = (
  open: OpenShoot,
  photo: string,
  before: PublishedPhoto | undefined,
) =>
  Effect.gen(function* () {
    const publication = yield* readPublication(open);
    const now = publication?.photos.find((one) => one.photo === photo);
    if (publication?.albumId === undefined || now === undefined) {
      return;
    }
    // Immich has the same file once, so it may be another photo's upload,
    // also one of another shoot, or have been in the album before.
    const others = yield* uploadsOfOthers(open);
    const isShared =
      !isAdded(now) ||
      others.inAlbum(publication.albumId, now.asset) ||
      publication.photos.some(
        (one) => one.photo !== photo && one.asset === now.asset,
      );
    const refused = isShared
      ? []
      : yield* removeFromAlbum(publication.albumId, [now.asset]);
    if (refused.length > 0) {
      const reasons = refused.map(({ reason }) => reason).join(', ');
      return yield* new ToolFailed({
        message: `Immich did not take ${photo} back out of the album (${reasons}), so it is in it.`,
      });
    }
    const restored = {
      ...publication,
      photos: [
        ...publication.photos.filter((one) => one.photo !== photo),
        ...(before === undefined ? [] : [before]),
      ],
    };
    const inUse = assetsInUse(restored);
    const outdated = new Set([
      ...(publication.outdated ?? []),
      ...(isAdded(now) && isCreated(now) ? [now.asset] : []),
    ]);
    yield* writeJson(Publication, open.files.publication, {
      ...restored,
      outdated: [...outdated].filter((asset) => !inUse.has(asset)),
    });
    yield* readAlbum(open);
  }).pipe(withChoice(open.files));
