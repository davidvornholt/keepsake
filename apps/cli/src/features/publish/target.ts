import { Effect, Option, Schema } from 'effect';
import { type Publication, Removed } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { type NamedAlbum, uniqueNamed } from '../../shared/immich.ts';
import { withAlbum } from '../../shared/lock.ts';
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
export const giveRemovalsTheirAlbum = (
  open: OpenShoot,
  album: string | undefined,
) => giveTheirAlbum(open, album).pipe(withAlbum(open.files));

const giveTheirAlbum = Effect.fn('giveRemovalsTheirAlbum')(function* (
  open: OpenShoot,
  album: string | undefined,
) {
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
});

const untitled = (open: OpenShoot) =>
  new InvalidInput({
    message: `${open.shoot.name} has no title to name a new album after. Give it one with --title "<album name>" on \`keepsake scan\` or \`keepsake run\`, or name an album with \`keepsake publish --album\`.`,
  });

/**
 * Fails for a shoot that has no title and no album yet, since keepsake would
 * have nothing to name a new album after.
 */
export const checkTitled = Effect.fn('checkTitled')(function* (
  open: OpenShoot,
) {
  if (
    open.shoot.title === undefined &&
    (yield* readPublication(open)) === null
  ) {
    return yield* untitled(open);
  }
});

/**
 * The album keepsake published to before, unless another is named. Albums are
 * found by their id, so one renamed in Immich stays the album. A shoot's first
 * album is a new one named after its title, even when an album has that name
 * already, since a title without a date may be that of another trip. Only an
 * album named with --album is looked up by its name. When the album is gone,
 * keepsake makes a new one rather than take another album that has its name
 * now, which may be shared with others, but only if the album was the
 * account's own.
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
    const { title } = open.shoot;
    return title === undefined ? yield* untitled(open) : fresh(title);
  }
  return withId(before.albumId) ?? (yield* gone(before));
});
