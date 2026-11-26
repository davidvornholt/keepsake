import {
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  type Semaphore,
} from 'effect';
import { rgbaToThumbHash } from 'thumbhash';
import { developed } from '../../shared/develop.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { sizeOf } from '../../shared/pictures.ts';
import {
  atomically,
  exists,
  type OpenShoot,
  readJson,
  writeJson,
} from '../../shared/store.ts';
import { toolBytes } from '../../shared/tools.ts';
import { xdgDirectory } from '../../shared/xdg.ts';
import { type Picture, pictureWidths } from './contract.ts';

/** The pictures there are of a photo. An earlier one has its file's name. */
export type Kind = 'preview' | 'camera' | 'final' | `earlier-${string}`;

const earlierPattern = /^earlier-(?<stamp>\d+)$/u;

/** The file of a picture, or nothing when there can't be one. */
const fileOf = (open: OpenShoot, photo: string, kind: string) => {
  const files = open.files.edit(photo);
  const stamp = earlierPattern.exec(kind)?.groups?.stamp;
  if (stamp !== undefined) {
    return `${files.earlier}/${stamp}.jpg`;
  }
  return kind === 'preview'
    ? open.files.preview(photo)
    : new Map([
        ['camera', files.camera],
        ['final', files.final],
      ]).get(kind);
};

const versionBase = 36;

const versionOf = Effect.fn('versionOf')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs
    .stat(file)
    .pipe(
      Effect.mapError(
        ({ message }) =>
          new StoreFailed({ message: `Could not use ${file}: ${message}` }),
      ),
    );
  const changed = Option.match(info.mtime, {
    onNone: () => 0,
    onSome: (time) => time.getTime(),
  });
  return `${changed.toString(versionBase)}-${Number(info.size).toString(versionBase)}`;
});

const Look = Schema.Struct({
  width: Schema.Int,
  height: Schema.Int,
  placeholder: Schema.String,
});
type Look = typeof Look.Type;
const Looks = Schema.Record(Schema.String, Look);

/** The pictures of a shoot, their sizes and their smaller copies. */
export type Gallery = {
  readonly open: OpenShoot;
  readonly cache: string;
  readonly looks: Map<string, Look>;
  /** Keeps the machine usable while many pictures are made smaller. */
  readonly workers: Semaphore.Semaphore;
};

const looksFile = (cache: string) => `${cache}/looks.json`;

export const openGallery = Effect.fn('openGallery')(function* (
  open: OpenShoot,
  workers: Semaphore.Semaphore,
) {
  const path = yield* Path.Path;
  const cache = path.join(
    yield* xdgDirectory('XDG_CACHE_HOME', '.cache'),
    'keepsake',
    open.shoot.name,
  );
  const looks = Option.getOrElse(
    yield* readJson(Looks, looksFile(cache)),
    () => ({}),
  );
  return {
    open,
    cache,
    looks: new Map(Object.entries(looks)),
    workers,
  } satisfies Gallery;
});

export const saveLooks = ({ cache, looks }: Gallery) =>
  writeJson(Looks, looksFile(cache), Object.fromEntries(looks));

const placeholderSide = 64;

const lookAt = Effect.fn('lookAt')(function* (file: string) {
  const { width, height } = yield* sizeOf(file);
  const scale = placeholderSide / Math.max(width, height);
  const small = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  const size = `${small.width}x${small.height}`;
  const rgba = yield* toolBytes('magick', [
    '-define',
    `jpeg:size=${size}`,
    file,
    '-resize',
    `${size}!`,
    '-alpha',
    'set',
    '-depth',
    '8',
    'rgba:-',
  ]);
  const hash = rgbaToThumbHash(small.width, small.height, rgba);
  return {
    width,
    height,
    placeholder: Buffer.from(hash).toString('base64'),
  } satisfies Look;
});

/** A picture of a photo, as the page shows it. */
export const pictureOf = Effect.fn('pictureOf')(function* (
  { open, looks, workers }: Gallery,
  photo: string,
  kind: Kind,
) {
  const file = fileOf(open, photo, kind) ?? '';
  const version = yield* versionOf(file);
  const key = `${photo}/${kind}/${version}`;
  const look = looks.get(key) ?? (yield* workers.withPermits(1)(lookAt(file)));
  looks.set(key, look);
  return {
    src: `/pictures/${open.shoot.name}/${encodeURIComponent(photo)}/${kind}/${version}`,
    ...look,
  } satisfies Picture;
});

/** Whether a picture's file is still the version that was asked for. */
export const isCurrent = Effect.fn('isCurrent')(function* (
  { open }: Gallery,
  photo: string,
  kind: string,
  version: string,
) {
  const file = fileOf(open, photo, kind);
  return file === undefined
    ? false
    : yield* versionOf(file).pipe(
        Effect.map((current) => current === version),
        Effect.orElseSucceed(() => false),
      );
});

const smallQuality = '82';

/** A smaller copy of a picture, which is made the first time. */
export const smaller = Effect.fn('smaller')(function* (
  { open, cache, workers }: Gallery,
  photo: string,
  kind: string,
  width: number,
) {
  const file = fileOf(open, photo, kind);
  if (file === undefined || !(yield* exists(file))) {
    return;
  }
  const version = yield* versionOf(file);
  const target = `${cache}/${photo}/${kind}-${version}-${width}.webp`;
  if (!(yield* exists(target))) {
    yield* workers.withPermits(1)(
      atomically(target, (draft) =>
        toolBytes('magick', [
          '-define',
          `jpeg:size=${width * 2}x${width * 2}`,
          file,
          '-resize',
          `${width}x>`,
          '-strip',
          '-quality',
          smallQuality,
          '-define',
          'webp:method=4',
          draft,
        ]),
      ),
    );
  }
  return target;
});

const fullQuality = 92;

/** A picture in full size. */
export const fullSize = Effect.fn('fullSize')(function* (
  { open }: Gallery,
  photo: string,
  kind: string,
) {
  const details = open.photos.get(photo);
  if (kind === 'preview' && details !== undefined) {
    const picture = yield* developed(open.shoot, details, {
      quality: fullQuality,
    }).pipe(
      Effect.map(Option.some),
      // The photo itself can't be read now, such as on a drive that's away.
      Effect.orElseSucceed(() => Option.none<Uint8Array<ArrayBuffer>>()),
    );
    if (Option.isSome(picture)) {
      return picture.value;
    }
  }
  const file = fileOf(open, photo, kind);
  return file !== undefined && (yield* exists(file)) ? file : undefined;
});

const [, first] = pictureWidths;

/** Makes the copies the page shows first, so nobody waits for them. */
export const warmUp = Effect.fn('warmUp')(function* (
  gallery: Gallery,
  kinds: ReadonlyArray<readonly [photo: string, kind: Kind]>,
) {
  yield* Effect.forEach(
    kinds,
    ([photo, kind]) => smaller(gallery, photo, kind, first).pipe(Effect.ignore),
    { concurrency: 2, discard: true },
  );
});
