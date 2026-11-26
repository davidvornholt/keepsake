import { DateTime, Effect, Option, Schema } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { PickList, Removed } from '../../shared/domain.ts';
import { InvalidInput, ToolFailed } from '../../shared/errors/errors.ts';
import { removeFromAlbum } from '../../shared/immich.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { isOutOf, readAllRemoved } from '../../shared/standing.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';

const notTakenOut = (
  photos: ReadonlyArray<string>,
  refused: ReadonlyArray<{ readonly id: string; readonly reason: string }>,
) => {
  const reasons = refused.map(({ id, reason }) => `${id}: ${reason}`);
  return new ToolFailed({
    message: `Immich did not take ${photos.join(', ')} out of the album (${reasons.join(', ')}), so ${photos.length === 1 ? 'it is' : 'they are'} still in it.`,
  });
};

/** The photos that are to be in the album. */
const pickedOf = Effect.fn('pickedOf')(function* ({ files }: OpenShoot) {
  const list = Option.getOrNull(yield* readJson(PickList, files.picks));
  return new Set(list?.picks.map(({ photo }) => photo));
});

/**
 * Takes photos out of the album, or out of those that are to be in it, or says
 * why they were taken out before. They stay in the library.
 */
export const takeOut = Effect.fn('takeOut')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  because: string,
) {
  const { name } = open.shoot;
  const album = yield* readAlbum(open);
  const all = yield* readAllRemoved(open);
  const before = all.filter(isOutOf(album?.id));
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
      : Effect.succeed({
          id,
          asset: there?.asset,
          assets: there === undefined ? [] : [there.asset],
          at: earlier?.at,
        });
  });
  const assets = found.flatMap((one) => one.assets);
  const refused =
    album !== null && assets.length > 0
      ? yield* removeFromAlbum(album.id, assets)
      : [];
  const isRefused = (one: (typeof found)[number]) =>
    refused.some(({ id }) => one.assets.includes(id));
  const out = found.filter((one) => !isRefused(one));
  const now = DateTime.formatIso(yield* DateTime.now);
  const ids = new Set(out.map(({ id }) => id));
  // The owner's own reason keeps a photo out of every album.
  yield* writeJson(Schema.Array(Removed), open.files.removed, [
    ...all.filter(({ photo }) => !ids.has(photo)),
    ...out.map(({ id, at }) => ({ photo: id, at: at ?? now, because })),
  ]);
  const after = yield* readAlbum(open);
  if (refused.length > 0) {
    return yield* notTakenOut(
      found.filter(isRefused).map(({ id }) => id),
      refused,
    );
  }
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
