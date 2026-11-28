import { Effect, Option, Schema } from 'effect';
import { type Publication, Removed } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import {
  albumsNamed,
  isOwnAlbum,
  type NamedAlbum,
  signedInUser,
  uniqueNamed,
} from '../../shared/immich.ts';
import { withAlbum } from '../../shared/lock.ts';
import { readPublication } from '../../shared/publication.ts';
import { isOutOf, readAllRemoved } from '../../shared/standing.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';

/**
 * Which albums of a name a publish may take: on a shoot's first publish only
 * the account's own, since one shared by someone else is theirs to fill, and
 * with --album any the owner named.
 */
export type Lookup = {
  readonly isOwnOnly: boolean;
  /** What to do instead, when several albums have the name. */
  readonly otherwise: string;
};

/** The album to publish to, which has no id until it is created. */
export type Target =
  | NamedAlbum
  | {
      readonly id: undefined;
      readonly name: string;
      /** How to look again before it is made, unless it is made anyway. */
      readonly lookup: Lookup | null;
    };

const fresh = (name: string, lookup: Lookup | null = null): Target => ({
  id: undefined,
  name,
  lookup,
});

/**
 * The one album of this name a publish may take, if there is one. Where
 * photos can't tell whose an album of the name is, a first publish takes
 * none and makes none, since it may be someone else's or the owner's own.
 */
export const albumOfName = Effect.fn('albumOfName')(function* (
  albums: ReadonlyArray<NamedAlbum>,
  name: string,
  { isOwnOnly, otherwise }: Lookup,
) {
  if (!isOwnOnly) {
    return yield* uniqueNamed(albums, name, otherwise);
  }
  const user = yield* signedInUser;
  const same = albumsNamed(albums, name);
  if (same.some((album) => isOwnAlbum(album, user) === undefined)) {
    // --album can't name one of several, so the owner tells them apart first.
    if (same.length > 1) {
      return yield* uniqueNamed(same, name, otherwise);
    }
    const why =
      user === null
        ? "photos' key may not read which account it belongs to (`photos status` names the permissions it lacks)"
        : "photos doesn't say who owns it";
    return yield* new InvalidInput({
      message: `Immich has an album called ${name}, and keepsake can't tell whether it is this account's own or one someone shared with it, because ${why}. So it published nothing. If the album is yours, publish to it with --album; if not, ${otherwise}.`,
    });
  }
  return yield* uniqueNamed(
    same.filter((album) => isOwnAlbum(album, user) === true),
    name,
    otherwise,
  );
});

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

export const bringBackNamed = (
  open: OpenShoot,
  photos: ReadonlySet<string>,
  album: string,
) =>
  Effect.gen(function* () {
    const all = yield* readAllRemoved(open, undefined);
    const isBack = (one: Removed) =>
      photos.has(one.photo) && isOutOf(album)(one);
    if (all.some(isBack)) {
      yield* writeJson(
        Schema.Array(Removed),
        open.files.removed,
        all.filter((one) => !isBack(one)),
      );
    }
  }).pipe(withAlbum(open.files));

/**
 * The album keepsake published to before, unless another is named. Albums are
 * found by their id, so one renamed in Immich stays the album. A shoot's first
 * album is the account's own one that has its title, so shoots of one place
 * share an album, and a new one only when none has that name. An album named
 * with --album is looked up by its name among all, also when keepsake
 * published to one of that name before, so it never takes one of two. When
 * the album is gone, keepsake makes a new one rather than take another album
 * that has its name now, which may be shared with others, but only if the
 * album was the account's own.
 */
export const targetOf = Effect.fn('targetOf')(function* (
  open: OpenShoot,
  before: Publication | null,
  chosen: Option.Option<string>,
  albums: ReadonlyArray<NamedAlbum>,
) {
  if (Option.isSome(chosen)) {
    const lookup = {
      isOwnOnly: false,
      otherwise: 'or give another name with --album',
    };
    const name = chosen.value.trim();
    return (yield* albumOfName(albums, name, lookup)) ?? fresh(name, lookup);
  }
  if (before === null) {
    const { name, source, title } = open.shoot;
    const lookup = {
      isOwnOnly: true,
      otherwise: `publish to another with --album, or give the shoot another title with \`keepsake scan "${source}" --name ${name} --title "<title>"\``,
    };
    return (yield* albumOfName(albums, title, lookup)) ?? fresh(title, lookup);
  }
  return (
    albums.find((album) => album.id === before.albumId) ?? (yield* gone(before))
  );
});
