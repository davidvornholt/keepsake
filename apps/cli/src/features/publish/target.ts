import { Effect, Option, Schema } from 'effect';
import { type Publication, Removed } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { type NamedAlbum, uniqueNamed } from '../../shared/immich.ts';
import { albumsOf, readPublication } from '../../shared/publication.ts';
import { readAllRemoved } from '../../shared/standing.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';

/** The album to publish to, which has no id until it is created. */
export type Target =
  | NamedAlbum
  | { readonly id: undefined; readonly name: string };

const fresh = (name: string): Target => ({ id: undefined, name });

/**
 * An album that is gone from the account's list was deleted, or its owner
 * stopped sharing it, which looks the same. Only one the account owned may be
 * made again, as one made in place of a shared album would be no one else's.
 */
const gone = (before: Publication) =>
  before.owned === true
    ? Effect.succeed(fresh(before.album))
    : Effect.fail(
        new InvalidInput({
          message: `${before.album} is no longer in Immich, and keepsake can't tell that this account deleted it rather than that its owner stopped sharing it, so it makes no album in its place. Ask the owner to share it again, or choose an album with --album.`,
        }),
      );

/**
 * What keepsake published. A record from before it kept album ids, and with
 * no album read since, gets the id of the album with its name.
 */
export const knownPublication = Effect.fn('knownPublication')(function* (
  open: OpenShoot,
  albums: ReadonlyArray<NamedAlbum>,
) {
  const before = yield* readPublication(open);
  if (before === null || before.albumId !== undefined) {
    return before;
  }
  const found = yield* uniqueNamed(albums, before.album);
  return found === undefined ? before : { ...before, albumId: found.id };
});

/**
 * Notes the album of the photos that went missing before keepsake kept album
 * ids, which is the one it published to then, before it publishes elsewhere.
 */
export const giveRemovalsTheirAlbum = Effect.fn('giveRemovalsTheirAlbum')(
  function* (open: OpenShoot, album: string | undefined) {
    const isLegacy = (yield* readAllRemoved(open, undefined)).some(
      (one) => one.because === null && one.album === undefined,
    );
    if (album !== undefined && isLegacy) {
      yield* writeJson(
        Schema.Array(Removed),
        open.files.removed,
        yield* readAllRemoved(open, album),
      );
    }
  },
);

/**
 * The album keepsake published to before, unless another is named. Albums are
 * found by their id, so one renamed in Immich stays the album. A name is
 * looked up only for an album keepsake hasn't published to, and when its
 * album is gone, keepsake makes a new one rather than take another album
 * that has its name now, which may be shared with others, but only if the
 * album was the account's own.
 */
export const targetOf = Effect.fn('targetOf')(function* (
  open: OpenShoot,
  before: Publication | null,
  chosen: Option.Option<string>,
  albums: ReadonlyArray<NamedAlbum>,
) {
  const withId = (id: string | undefined) =>
    albums.find((album) => album.id === id);
  if (Option.isSome(chosen)) {
    const name = chosen.value;
    const known = albumsOf(before)
      .map(({ albumId }) => withId(albumId))
      .find((album) => album?.name === name);
    return known ?? (yield* uniqueNamed(albums, name)) ?? fresh(name);
  }
  if (before === null) {
    const name = open.shoot.about ?? open.shoot.name;
    return (yield* uniqueNamed(albums, name)) ?? fresh(name);
  }
  return withId(before.albumId) ?? (yield* gone(before));
});
