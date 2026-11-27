import { Effect } from 'effect';
import { ToolFailed } from '../../shared/errors/errors.ts';
import { removeFromAlbum } from '../../shared/immich.ts';

/**
 * Takes an upload back out of the album after the rest of its photo failed,
 * and says so when it stays in it.
 */
export const takeBack = (album: string, asset: string, failed: string) =>
  removeFromAlbum(album, [asset]).pipe(
    Effect.map((refused) => refused.map(({ reason }) => reason).join(', ')),
    Effect.catch(({ message }) => Effect.succeed(message)),
    Effect.flatMap((why) =>
      Effect.fail(
        new ToolFailed({
          message:
            why === ''
              ? failed
              : `${failed} ${asset} is still in the album, as it couldn’t be taken back out: ${why}`,
        }),
      ),
    ),
  );
