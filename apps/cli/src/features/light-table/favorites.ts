import { Effect, Option } from 'effect';
import { Album } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { markFavorite } from '../../shared/immich.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
import type { Favorite } from './schemas.ts';

/** Gives a photo of the album the favorite mark in Immich, or takes it away. */
export const setFavorite = Effect.fn('setFavorite')(function* (
  { files }: OpenShoot,
  { photo, favorite }: Favorite,
) {
  const album = Option.getOrNull(yield* readJson(Album, files.album));
  const there = album?.photos.find((one) => one.photo === photo);
  if (album === null || there === undefined) {
    return yield* new InvalidInput({
      message: 'Only a photo of the album can be a favorite.',
    });
  }
  yield* markFavorite(there.asset, favorite);
  yield* writeJson(Album, files.album, {
    ...album,
    photos: album.photos.map((one) =>
      one.photo === photo ? { ...one, favorite } : one,
    ),
  });
});
