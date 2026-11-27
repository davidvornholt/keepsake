import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export type FakeAsset = {
  readonly id: string;
  readonly fileName: string;
  readonly favorite: boolean;
  readonly trashed: boolean;
};

export type FakeAlbum = {
  readonly id: string;
  /** Changes when the owner renames the album in Immich. */
  name: string;
  /** Whose album it is, when it is not the owner's own but shared with them. */
  readonly owner?: string;
  /** The days of its first and last photo, which `photos` gives. */
  readonly taken?: { readonly first: string; readonly last: string };
  assets: ReadonlyArray<FakeAsset>;
};

/** What the fake Immich holds, which `fakeTools` keeps for the tests. */
export type FakeImmich = {
  /** Files the photos command has sent to Immich, in the order it got them. */
  readonly uploads: Array<string>;
  /** The assets in Immich, with the file and the checksum of its bytes. */
  readonly library: Array<{ id: string; file: string; checksum: string }>;
  /** The albums in Immich, the first of which is created as `album-1`. */
  readonly albums: Array<FakeAlbum>;
  /** Assets Immich refuses to put into an album or take out of one. */
  readonly refused: ReadonlySet<string>;
  /** Assets moved to the trash, in the order they were. */
  readonly trashed: Array<string>;
};

const baseOf = (file: string) => file.slice(file.lastIndexOf('/') + 1);

const albumOf = (immich: FakeImmich, id: string) => {
  const found = immich.albums.find((album) => album.id === id);
  if (found === undefined) {
    throw new Error(`No album ${id}`);
  }
  return found;
};

/** The account the photos command is signed in to. */
const user = 'Owner';

const named = ({ id, name, owner, taken }: FakeAlbum) => ({
  id,
  name,
  owner: owner ?? user,
  firstTakenOn: taken?.first ?? null,
  lastTakenOn: taken?.last ?? null,
});

/** Immich's answer for each asset, as `photos` passes it on. */
const bulk = (
  immich: FakeImmich,
  ids: ReadonlyArray<string>,
  change: (id: string) => string | undefined,
) => {
  const results = ids.map((id) => ({
    id,
    reason: immich.refused.has(id) ? 'no_permission' : change(id),
  }));
  return {
    changed: results.flatMap(({ id, reason }) =>
      reason === undefined ? [id] : [],
    ),
    unchanged: results.flatMap(({ id, reason }) =>
      reason === undefined ? [] : [{ id, reason }],
    ),
  };
};

const addAssets = (
  immich: FakeImmich,
  album: FakeAlbum,
  ids: ReadonlyArray<string>,
) => {
  const { changed, unchanged } = bulk(immich, ids, (id) =>
    album.assets.some((asset) => asset.id === id) ? 'duplicate' : undefined,
  );
  album.assets = [
    ...album.assets,
    ...changed.map((id) => ({
      id,
      fileName: baseOf(
        immich.library.find((asset) => asset.id === id)?.file ?? id,
      ),
      favorite: false,
      trashed: false,
    })),
  ];
  return { album: named(album), added: changed, unchanged };
};

const removeAssets = (
  immich: FakeImmich,
  album: FakeAlbum,
  ids: ReadonlyArray<string>,
) => {
  const { changed, unchanged } = bulk(immich, ids, (id) =>
    album.assets.some((asset) => asset.id === id) ? undefined : 'not_found',
  );
  album.assets = album.assets.filter(({ id }) => !changed.includes(id));
  return { album: named(album), removed: changed, unchanged };
};

/** Immich knows a file again by its checksum, wherever the file is. */
const assetFor = (immich: FakeImmich, file: string) => {
  const checksum = createHash('sha1')
    .update(existsSync(file) ? readFileSync(file) : file)
    .digest('hex');
  const known = immich.library.find((asset) => asset.checksum === checksum);
  if (known !== undefined) {
    return { status: 'duplicate', assetId: known.id, trashed: false };
  }
  immich.uploads.push(file);
  const id = `asset-${immich.uploads.length}`;
  immich.library.push({ id, file, checksum });
  return { status: 'created', assetId: id };
};

const upload = (
  immich: FakeImmich,
  [, file = '', flag, albumId = '']: ReadonlyArray<string>,
) => {
  const result = assetFor(immich, file);
  return {
    files: [{ file, ...result }],
    ...(flag === '--album'
      ? { album: addAssets(immich, albumOf(immich, albumId), [result.assetId]) }
      : {}),
  };
};

const createAlbum = (immich: FakeImmich, name: string) => {
  const album = {
    id: `album-${immich.albums.length + 1}`,
    name,
    assets: [],
  };
  immich.albums.push(album);
  return named(album);
};

const listAlbums = (immich: FakeImmich, args: ReadonlyArray<string>) => {
  const part = args[2] === '--name' ? (args[3] ?? '').toLowerCase() : '';
  return immich.albums
    .filter(({ name }) => name.toLowerCase().includes(part))
    .map(named);
};

const markFavorite = (
  immich: FakeImmich,
  [, id, flag]: ReadonlyArray<string>,
) => {
  for (const album of immich.albums) {
    album.assets = album.assets.map((asset) =>
      asset.id === id ? { ...asset, favorite: flag === '--favorite' } : asset,
    );
  }
  return {};
};

/** Moves assets to the trash, where albums no longer show them. */
const trash = (immich: FakeImmich, ids: ReadonlyArray<string>) => {
  const before = new Set(
    immich.albums.flatMap(({ assets }) =>
      assets.flatMap(({ id, trashed }) => (trashed ? [id] : [])),
    ),
  );
  for (const album of immich.albums) {
    album.assets = album.assets.map((asset) =>
      ids.includes(asset.id) ? { ...asset, trashed: true } : asset,
    );
  }
  immich.trashed.push(...ids.filter((id) => !before.has(id)));
  return {
    trashed: ids.filter((id) => !before.has(id)).map((id) => ({ id })),
    alreadyInTrash: ids.filter((id) => before.has(id)),
    trashDays: 30,
    restoreWith: `photos restore ${ids.join(' ')}`,
  };
};

/** What the photos command answers, from the Immich that it reaches. */
export const answerPhotos = (
  immich: FakeImmich,
  args: ReadonlyArray<string>,
): unknown => {
  const [, , albumId = '', ...assets] = args;
  switch (`${args[0]} ${args[1]}`) {
    case 'albums list':
      return listAlbums(immich, args);
    case 'albums create':
      return createAlbum(immich, albumId);
    case 'albums show':
      return {
        album: named(albumOf(immich, albumId)),
        assets: albumOf(immich, albumId).assets,
        nextCursor: null,
      };
    case 'albums remove':
      return removeAssets(immich, albumOf(immich, albumId), assets);
    case 'tags list':
      return [];
    case 'status undefined':
      return { server: 'https://photos.example.com', user };
    default:
      if (args[0] === 'update') {
        return markFavorite(immich, args);
      }
      if (args[0] === 'trash') {
        return trash(immich, args.slice(1));
      }
      return args[0] === 'upload' ? upload(immich, args) : {};
  }
};
