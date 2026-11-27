import { Effect, type FileSystem, type Path } from 'effect';
import type { Publication, SendingPhoto } from '../../shared/domain.ts';
import { type StoreFailed, ToolFailed } from '../../shared/errors/errors.ts';
import { removeFromAlbum } from '../../shared/immich.ts';
import { uploadsOfOthers } from '../../shared/publication.ts';
import type { OpenShoot } from '../../shared/store.ts';
import { withSending } from './record.ts';

/** Where a photo is sent: the album, and what has to happen on the way. */
export type Sending = {
  readonly album: string;
  /** Notes how far the upload is, before the rest of the photo is sent. */
  readonly note: (
    change: (publication: Publication) => Publication,
  ) => Effect.Effect<void, StoreFailed, FileSystem.FileSystem | Path.Path>;
};

/** Why Immich left the upload in the album, or nothing once it is out. */
const takenOut = (album: string, asset: string) =>
  removeFromAlbum(album, [asset]).pipe(
    Effect.map((refused) => refused.map(({ reason }) => reason).join(', ')),
    Effect.catch(({ message }) => Effect.succeed(message)),
  );

/**
 * Takes the upload of a photo whose rest failed back out of the album, and
 * says so when it stays in it. One that another shoot's publication names
 * there stays for that shoot. Once it is out, the shoot no longer put it
 * there, so a retry leaves what another shoot puts there meanwhile.
 */
export const rollBack = Effect.fn('rollBack')(function* (
  open: OpenShoot,
  sending: SendingPhoto,
  { album, note }: Sending,
  failed: string,
) {
  const others = yield* uploadsOfOthers(open);
  if (others.inAlbum(album, sending.asset)) {
    return yield* new ToolFailed({ message: failed });
  }
  const why = yield* takenOut(album, sending.asset);
  if (why === '') {
    yield* note((publication) =>
      withSending(publication, { ...sending, added: false }, false),
    );
  }
  return yield* new ToolFailed({
    message:
      why === ''
        ? failed
        : `${failed} ${sending.asset} is still in the album, as it couldn’t be taken back out: ${why}`,
  });
});
