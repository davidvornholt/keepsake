import { Effect } from 'effect';
import { rendered } from '../../shared/pictures.ts';
import type { OpenShoot } from '../../shared/store.ts';
import type { Piece } from '../../shared/vision.ts';

const pictureSide = 768;

/** Photos with their numbers, for a question about them. */
export const showing = Effect.fn('showing')(function* (
  { files }: OpenShoot,
  photos: ReadonlyArray<string>,
) {
  const pictures = yield* Effect.forEach(photos, (photo) =>
    rendered(files.preview(photo), { longSide: pictureSide }),
  );
  return pictures.flatMap(
    (picture, index): Array<Piece> => [`Photo ${index + 1}:`, picture],
  );
});

export const role =
  'You explain to somebody who looks through the photos they took why one of them isn’t in the album of the trip. They want to know what speaks against this photo, so that they can decide whether they agree.';
