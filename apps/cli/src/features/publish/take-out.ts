import { DateTime, Effect, Option, Schema } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import {
  type Album,
  type AlbumPhoto,
  PickList,
  Removed,
} from '../../shared/domain.ts';
import { InvalidInput, ToolFailed } from '../../shared/errors/errors.ts';
import { albumAssets, removeFromAlbum } from '../../shared/immich.ts';
import { withAlbum } from '../../shared/lock.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { readPublication } from '../../shared/publication.ts';
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
 * Every upload of each photo that is in the album now, also those that were
 * replaced and wait there for the trash, and the uploads that are photos of
 * the album now.
 */
const versionsIn = Effect.fn('versionsIn')(function* (
  open: OpenShoot,
  album: Album | null,
) {
  const versions = new Map<string, ReadonlyArray<string>>();
  if (album === null) {
    return { versions, current: [] as ReadonlyArray<AlbumPhoto> };
  }
  const there = new Set((yield* albumAssets(album.id)).map(({ id }) => id));
  const published = (yield* readPublication(open))?.photos ?? [];
  const current = [...album.photos, ...published];
  const known = [
    ...album.photos.map(({ photo, asset }) => ({ photo, assets: [asset] })),
    ...published.map(({ photo, asset, replaced }) => ({
      photo,
      assets: [asset, ...(replaced ?? [])],
    })),
  ];
  for (const { photo, assets } of known) {
    const all = new Set([...(versions.get(photo) ?? []), ...assets]);
    versions.set(
      photo,
      [...all].filter((asset) => there.has(asset)),
    );
  }
  return { versions, current };
});

/**
 * Fails for a photo whose upload is also that of a photo that stays in the
 * album, as Immich has the same file only once.
 */
const sameAsStaying = (
  album: Album | null,
  current: ReadonlyArray<{ readonly photo: string; readonly asset: string }>,
  leaving: ReadonlySet<string>,
) => {
  const shared = (album?.photos ?? []).flatMap(({ photo, asset }) => {
    const other = current.find(
      (one) => one.asset === asset && !leaving.has(one.photo),
    );
    return leaving.has(photo) && other !== undefined
      ? [`${photo} is the same file in Immich as ${other.photo}`]
      : [];
  });
  return shared.length === 0
    ? Effect.void
    : Effect.fail(
        new InvalidInput({
          message: `${shared.join(', ')}, so it can leave the album only together with it. Name both, or neither.`,
        }),
      );
};

const takeOutNow = Effect.fn('takeOut')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  because: string,
) {
  const { name } = open.shoot;
  const album = yield* readAlbum(open);
  const all = yield* readAllRemoved(open, album?.id);
  const before = all.filter(isOutOf(album?.id));
  const picked = yield* pickedOf(open);
  const { versions, current } = yield* versionsIn(open, album);
  const photos = yield* Effect.forEach(names, (one) => photoNamed(open, one));
  const leaving = new Set(photos.map(({ id }) => id));
  yield* sameAsStaying(album, current, leaving);
  // An earlier upload that another photo is now stays for that one.
  const staying = new Set(
    current.flatMap(({ photo, asset }) => (leaving.has(photo) ? [] : [asset])),
  );
  const found = yield* Effect.forEach(photos, ({ id }) => {
    const there = album?.photos.find(({ photo }) => photo === id);
    const earlier = before.find(({ photo }) => photo === id);
    const assets = (versions.get(id) ?? []).filter(
      (asset) => !staying.has(asset),
    );
    return there === undefined &&
      assets.length === 0 &&
      earlier === undefined &&
      !picked.has(id)
      ? Effect.fail(
          new InvalidInput({
            message: `${id} isn’t in the album, isn’t to be in it, and never was taken out of it.`,
          }),
        )
      : Effect.succeed({ id, asset: there?.asset, assets, at: earlier?.at });
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

/**
 * Takes photos out of the album, or out of those that are to be in it, or says
 * why they were taken out before. They stay in the library.
 */
export const takeOut = (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  because: string,
) => takeOutNow(open, names, because).pipe(withAlbum(open.files));
