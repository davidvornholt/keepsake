import { Effect, Option, Path, type Semaphore } from 'effect';
import { developed } from '../../shared/develop.ts';
import type { Shoot } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { type PhotoFile, photoFilesIn, readPhotos } from '../../shared/exif.ts';
import { sizeOfBytes } from '../../shared/pictures.ts';
import type { FolderList, FolderLook } from './contract.ts';
import { spread } from './spread.ts';

// The folders with the owner's photos, of which they make albums. Only those
// below the folders that `serve` was told of are ever looked at.

type Found = {
  readonly path: string;
  readonly files: ReadonlyArray<string>;
  readonly from: number;
  readonly to: number;
};
type InRoot = Found & { readonly root: string };

/** Photos by the folder they are right in. */
export const byFolder = (
  path: Path.Path,
  photos: ReadonlyArray<PhotoFile>,
): ReadonlyMap<string, ReadonlyArray<PhotoFile>> => {
  const grouped = new Map<string, Array<PhotoFile>>();
  for (const photo of photos) {
    const folder = path.dirname(photo.file);
    const before = grouped.get(folder);
    if (before === undefined) {
      grouped.set(folder, [photo]);
    } else {
      before.push(photo);
    }
  }
  return grouped;
};

/** Every folder with photos right in it. */
const foldersIn = Effect.fn('foldersIn')(function* (root: string) {
  const path = yield* Path.Path;
  const grouped = byFolder(path, yield* photoFilesIn(root));
  return [...grouped].map(([folder, photos]): Found => {
    const times = photos.map(({ modified }) => modified);
    return {
      path: folder,
      files: photos.map(({ file }) => file).toSorted(),
      from: Math.min(...times),
      to: Math.max(...times),
    };
  });
});

/** The folders around a folder, below a root, outermost first. */
const around = (
  path: Path.Path,
  root: string,
  folder: string,
): ReadonlyArray<string> =>
  path.relative(root, folder).split(path.sep).filter(Boolean);

/** A folder, and every folder that it is in, with the photos of all below. */
const withOuter = (
  path: Path.Path,
  root: string,
  found: ReadonlyArray<Found>,
): ReadonlyArray<Found> => {
  const all = new Map<string, Found>();
  for (const one of found) {
    const parts = around(path, root, one.path);
    for (const [index] of parts.entries()) {
      const folder = path.join(root, ...parts.slice(0, index + 1));
      const before = all.get(folder);
      all.set(folder, {
        path: folder,
        files: [...(before?.files ?? []), ...one.files],
        from: Math.min(before?.from ?? one.from, one.from),
        to: Math.max(before?.to ?? one.to, one.to),
      });
    }
  }
  return [...all.values()];
};

const baseOf = (file: string) => file.slice(0, file.lastIndexOf('.'));

/** A RAW file and the JPEG the camera saved beside it are one photo. */
const countOf = (files: ReadonlyArray<string>) =>
  new Set(files.map(baseOf)).size;

const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

const allFolders = Effect.fn('allFolders')(function* (
  roots: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const found = yield* Effect.forEach(
    roots,
    (root) =>
      foldersIn(root).pipe(
        // A drive that is away doesn't hide the others.
        Effect.orElseSucceed((): ReadonlyArray<Found> => []),
        Effect.map((folders) =>
          withOuter(path, root, folders).map((folder) => ({
            root,
            ...folder,
          })),
        ),
      ),
    { concurrency: 'unbounded' },
  );
  return found.flat();
});

/** How long what the folders have is taken as current. */
const currentFor = '1 minute';

const named = (path: Path.Path, { root, path: folder }: InRoot) => {
  const parts = around(path, root, folder);
  return {
    name: parts.at(-1) ?? path.basename(folder),
    within: parts.slice(0, -1),
  };
};

/** The folders an album can be made of. */
export const makeFolders = Effect.fn('makeFolders')(function* (
  roots: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const all = yield* Effect.cachedWithTTL(allFolders(roots), currentFor);
  return {
    /** All of them, newest first. */
    list: (shoots: ReadonlyArray<Shoot>) =>
      Effect.map(all, (folders): FolderList => {
        const shootOf = new Map(
          shoots.map(({ source, name }) => [source, name]),
        );
        return {
          canAdd: roots.length > 0,
          folders: folders
            .toSorted((left, right) => right.to - left.to)
            .map((folder) => ({
              path: folder.path,
              ...named(path, folder),
              photos: countOf(folder.files),
              from: iso(folder.from),
              to: iso(folder.to),
              shoot: shootOf.get(folder.path) ?? null,
            })),
        };
      }),
    /** One of them. */
    at: Effect.fn('folderAt')(function* (wanted: string) {
      const found = (yield* all).find((folder) => folder.path === wanted);
      return found === undefined
        ? yield* new InvalidInput({ message: 'There are no photos there.' })
        : found;
    }),
  };
});
export type Folders = Effect.Success<ReturnType<typeof makeFolders>>;

const sampleCount = 12;
const sampleSide = 480;
const sampleQuality = 80;

/** A few photos of a folder, and when it was. */
export const lookAtFolder = Effect.fn('lookAtFolder')(function* (
  { path: folder, files }: Pick<Found, 'path' | 'files'>,
  workers: Semaphore.Semaphore,
) {
  const path = yield* Path.Path;
  const byBase = new Map(
    // The RAW files of a folder come first, so they count.
    files
      .toSorted()
      .toReversed()
      .map((file) => [baseOf(file), file] as const),
  );
  const ordered = [...byBase.values()].toReversed();
  const chosen = [
    ...new Set([
      ...ordered.slice(0, 1),
      ...spread(ordered, sampleCount),
      ...ordered.slice(-1),
    ]),
  ];
  const photos = yield* readPhotos(
    folder,
    chosen.map((file) => path.relative(folder, file)),
  );
  const shoot: Shoot = { name: '', source: folder, about: null };
  const samples = yield* Effect.forEach(
    photos,
    (photo) =>
      workers
        .withPermits(1)(
          Effect.gen(function* () {
            const bytes = yield* developed(
              shoot,
              { ...photo, hash: '' },
              { longSide: sampleSide, quality: sampleQuality },
            );
            return {
              src: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`,
              takenAt: photo.takenAt,
              ...(yield* sizeOfBytes(bytes)),
            };
          }),
        )
        .pipe(Effect.option),
    { concurrency: 'unbounded' },
  );
  return {
    path: folder,
    photos: countOf(files),
    from: photos[0]?.takenAt ?? '',
    to: photos.at(-1)?.takenAt ?? '',
    samples: samples.flatMap(Option.toArray),
  } satisfies FolderLook;
});
