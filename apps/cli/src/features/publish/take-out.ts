import { DateTime, Effect, Option, Schema } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { PickList, Removed } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { removeFromAlbum } from '../../shared/immich.ts';
import { withAlbum } from '../../shared/lock.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { readRemoved } from '../../shared/standing.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';

/** The photos that are to be in the album. */
const pickedOf = Effect.fn('pickedOf')(function* ({ files }: OpenShoot) {
  const list = Option.getOrNull(yield* readJson(PickList, files.picks));
  return new Set(list?.picks.map(({ photo }) => photo));
});

/**
 * Takes photos out of the album, or out of those that are to be in it, or says
 * why they were taken out before. They stay in the library.
 */
export const takeOut = (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  because: string,
) => takeOutNow(open, names, because).pipe(withAlbum(open.files));

const takeOutNow = Effect.fn('takeOut')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  because: string,
) {
  const { name } = open.shoot;
  const album = yield* readAlbum(open);
  const before = yield* readRemoved(open);
  const picked = yield* pickedOf(open);
  const photos = yield* Effect.forEach(names, (one) => photoNamed(open, one));
  const found = yield* Effect.forEach(photos, ({ id }) => {
    const there = album?.photos.find(({ photo }) => photo === id);
    const earlier = before.find(({ photo }) => photo === id);
    return there === undefined && earlier === undefined && !picked.has(id)
      ? Effect.fail(
          new InvalidInput({
            message: `${id} isn’t in the album, isn’t to be in it, and never was taken out of it.`,
          }),
        )
      : Effect.succeed({ id, asset: there?.asset, at: earlier?.at });
  });
  const assets = found.flatMap(({ asset }) => asset ?? []);
  if (album !== null && assets.length > 0) {
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
    album: album === null ? null : { id: album.id, name: album.name },
    takenOut: found.map(({ id, asset }) => ({
      photo: id,
      asset: asset ?? null,
    })),
    inAlbum: after?.photos.length ?? 0,
  };
});
