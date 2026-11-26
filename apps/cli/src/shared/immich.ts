import { Effect, Schema } from 'effect';
import { InvalidInput, ToolFailed } from './errors/errors.ts';
import { toolText } from './tools.ts';

// keepsake reaches Immich through the photos command, so it needs no key of
// its own: https://github.com/davidvornholt/photos

const photos = Effect.fn('photos')(function* <S extends Schema.Constraint>(
  schema: S,
  args: ReadonlyArray<string>,
) {
  const text = yield* toolText('photos', args);
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
    text,
  ).pipe(
    Effect.mapError(
      (error) =>
        new ToolFailed({
          message: `photos ${args[0] ?? ''} answered with something unexpected: ${error.message}`,
        }),
    ),
  );
});

const Named = Schema.Struct({ id: Schema.String, name: Schema.String });
const NamedList = Schema.Array(Named);

/**
 * The album with this name, if there is one. Albums are told apart by their
 * id, so a name two albums share names none of them.
 */
export const albumNamed = Effect.fn('albumNamed')(function* (name: string) {
  const albums = yield* photos(NamedList, ['albums', 'list', '--name', name]);
  const same = albums.filter((candidate) => candidate.name === name);
  if (same.length > 1) {
    return yield* new InvalidInput({
      message: `Immich has ${same.length} albums called ${name} (${same.map(({ id }) => id).join(', ')}), and keepsake can't tell which is meant. Rename all but one of them in Immich, or give another name with --album.`,
    });
  }
  return same[0];
});

/** The album with this id, under the name it has now, unless it is gone. */
export const albumWithId = Effect.fn('albumWithId')(function* (id: string) {
  const albums = yield* photos(NamedList, ['albums', 'list']);
  return albums.find((candidate) => candidate.id === id);
});

export const createAlbum = (name: string) =>
  photos(Named, ['albums', 'create', name]);

/** What Immich didn't change of what it was asked to, and why. */
const Unchanged = Schema.Array(
  Schema.Struct({ id: Schema.String, reason: Schema.String }),
);

const Uploaded = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      status: Schema.String,
      assetId: Schema.optionalKey(Schema.String),
      trashed: Schema.optionalKey(Schema.Boolean),
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
  album: Schema.optionalKey(
    Schema.Struct({ added: Schema.Array(Schema.String), unchanged: Unchanged }),
  ),
});

/** Why Immich didn't put an asset into the album, if it didn't. */
const notAdded = (asset: string, album: (typeof Uploaded.Type)['album']) => {
  if (album?.added.includes(asset) === true) {
    return;
  }
  const unchanged = album?.unchanged.find(({ id }) => id === asset);
  if (unchanged === undefined) {
    return 'it did not say whether it did';
  }
  // Immich's reason for a photo that was in the album already.
  return unchanged.reason === 'duplicate' ? undefined : unchanged.reason;
};

/** Uploads a file and returns its asset's id, also when Immich had it. */
export const uploadPhoto = Effect.fn('uploadPhoto')(function* (
  file: string,
  album: string | null,
) {
  const answer = yield* photos(Uploaded, [
    'upload',
    file,
    ...(album === null ? [] : ['--album', album]),
  ]);
  const [result] = answer.files;
  if (result?.assetId === undefined) {
    return yield* new ToolFailed({
      message: `Immich did not take ${file}: ${result?.reason ?? 'no reason given'}`,
    });
  }
  if (result.trashed === true) {
    return yield* new ToolFailed({
      message: `${file} is in Immich's trash. Restore it with \`photos restore ${result.assetId}\`.`,
    });
  }
  const refused =
    album === null ? undefined : notAdded(result.assetId, answer.album);
  if (refused !== undefined) {
    return yield* new ToolFailed({
      message: `Immich took ${file} as ${result.assetId} but did not put it into the album: ${refused}`,
    });
  }
  return result.assetId;
});

/** Puts photos on top of each other, so the timeline shows the first. */
export const stackPhotos = (top: string, below: string) =>
  photos(Schema.Unknown, ['stacks', 'create', top, below]);

/** Creates a tag unless there is one with this name. */
export const ensureTag = Effect.fn('ensureTag')(function* (tag: string) {
  const tags = yield* photos(NamedList, ['tags', 'list']);
  if (!tags.some(({ name }) => name === tag)) {
    yield* photos(Schema.Unknown, ['tags', 'create', tag]);
  }
});

export const tagPhoto = (tag: string, asset: string) =>
  photos(Schema.Unknown, ['tags', 'add', tag, asset]);

const Page = Schema.Struct({
  album: Schema.Struct({ id: Schema.String, name: Schema.String }),
  nextCursor: Schema.optionalKey(Schema.NullOr(Schema.String)),
  assets: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      fileName: Schema.String,
      favorite: Schema.Boolean,
      trashed: Schema.Boolean,
    }),
  ),
});
export type Asset = (typeof Page.Type)['assets'][number];

const pageSize = '1000';

/** Every photo of an album that isn't in the trash. */
export const albumAssets = Effect.fn('albumAssets')(function* (id: string) {
  const assets: Array<Asset> = [];
  let cursor: string | null = null;
  do {
    const page: typeof Page.Type = yield* photos(Page, [
      'albums',
      'show',
      id,
      '--limit',
      pageSize,
      ...(cursor === null ? [] : ['--cursor', cursor]),
    ]);
    assets.push(...page.assets.filter(({ trashed }) => !trashed));
    cursor = page.nextCursor ?? null;
  } while (cursor !== null);
  return assets;
});

const Removal = Schema.Struct({ unchanged: Unchanged });

/**
 * Takes photos out of an album and returns those Immich refused to take out,
 * with its reason. They stay in the library.
 */
export const removeFromAlbum = Effect.fn('removeFromAlbum')(function* (
  album: string,
  assets: ReadonlyArray<string>,
) {
  const { unchanged } = yield* photos(Removal, [
    'albums',
    'remove',
    album,
    ...assets,
  ]);
  // Immich's reason for a photo that wasn't in the album.
  return unchanged.filter(({ reason }) => reason !== 'not_found');
});

/** Gives a photo the favorite mark, or takes it away. */
export const markFavorite = (asset: string, isFavorite: boolean) =>
  photos(Schema.Unknown, [
    'update',
    asset,
    isFavorite ? '--favorite' : '--no-favorite',
  ]);

const Status = Schema.Struct({ server: Schema.String });

/** The web address of Immich. */
export const immichServer = Effect.map(
  photos(Status, ['status']),
  ({ server }) => server,
);
