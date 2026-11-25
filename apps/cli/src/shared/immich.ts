import { Effect, Schema } from 'effect';
import { ToolFailed } from './errors/errors.ts';
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

/** The album with this name, if there is one. */
export const findAlbum = Effect.fn('findAlbum')(function* (name: string) {
  const albums = yield* photos(NamedList, ['albums', 'list', '--name', name]);
  return albums.find((candidate) => candidate.name === name);
});

/** The album with this name, which is created when there is none. */
export const albumNamed = Effect.fn('albumNamed')(function* (name: string) {
  return (
    (yield* findAlbum(name)) ??
    (yield* photos(Named, ['albums', 'create', name]))
  );
});

const Uploaded = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      status: Schema.String,
      assetId: Schema.optionalKey(Schema.String),
      trashed: Schema.optionalKey(Schema.Boolean),
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
});

/** Uploads a file and returns its asset's id, also when Immich had it. */
export const uploadPhoto = Effect.fn('uploadPhoto')(function* (
  file: string,
  album: string | null,
) {
  const { files } = yield* photos(Uploaded, [
    'upload',
    file,
    ...(album === null ? [] : ['--album', album]),
  ]);
  const [result] = files;
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

/** Every photo of an album. */
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

/** Takes photos out of an album. They stay in the library. */
export const removeFromAlbum = (album: string, assets: ReadonlyArray<string>) =>
  photos(Schema.Unknown, ['albums', 'remove', album, ...assets]);

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
