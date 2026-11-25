import { DateTime, Effect, Schema } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { Removed } from '../../shared/domain.ts';
import { InvalidInput, StepMissing } from '../../shared/errors/errors.ts';
import { removeFromAlbum } from '../../shared/immich.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { readRemoved } from '../../shared/standing.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';

/**
 * Takes photos out of the album, or says why they were taken out before. They
 * stay in the library.
 */
export const takeOut = Effect.fn('takeOut')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  because: string,
) {
  const { name } = open.shoot;
  const album = yield* readAlbum(open);
  if (album === null) {
    return yield* new StepMissing({
      message: `${name} has no album. Run \`keepsake publish ${name}\` first.`,
    });
  }
  const before = yield* readRemoved(open);
  const photos = yield* Effect.forEach(names, (one) => photoNamed(open, one));
  const found = yield* Effect.forEach(photos, ({ id }) => {
    const there = album.photos.find(({ photo }) => photo === id);
    const earlier = before.find(({ photo }) => photo === id);
    return there === undefined && earlier === undefined
      ? Effect.fail(
          new InvalidInput({
            message: `${id} isn’t in the album and never was taken out of it.`,
          }),
        )
      : Effect.succeed({ id, asset: there?.asset, at: earlier?.at });
  });
  const assets = found.flatMap(({ asset }) => asset ?? []);
  if (assets.length > 0) {
    yield* removeFromAlbum(album.id, assets);
  }
  const now = DateTime.formatIso(yield* DateTime.now);
  const ids = new Set(found.map(({ id }) => id));
  yield* writeJson(Schema.Array(Removed), open.files.removed, [
    ...before.filter(({ photo }) => !ids.has(photo)),
    ...found.map(({ id, at }) => ({ photo: id, at: at ?? now, because })),
  ]);
  const after = yield* readAlbum(open);
  return {
    shoot: name,
    album: { id: album.id, name: album.name },
    takenOut: found.map(({ id, asset }) => ({
      photo: id,
      asset: asset ?? null,
    })),
    inAlbum: after?.photos.length ?? 0,
  };
});
