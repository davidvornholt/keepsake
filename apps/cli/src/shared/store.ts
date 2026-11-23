import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Moment, Photo, PickList, Shoot } from './domain.ts';
import { InvalidInput, StepMissing, StoreFailed } from './errors/errors.ts';
import { xdgDirectory } from './xdg.ts';

const storeFailed = (path: string) => (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use ${path}: ${error.message}` });

/** Reads a JSON file of keepsake's own, or none when there isn't one yet. */
export const readJson = <S extends Schema.Constraint>(
  schema: S,
  path: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(path).pipe(
      Effect.map(Option.some),
      Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeedNone),
      Effect.mapError(storeFailed(path)),
    );
    if (Option.isNone(text)) {
      return Option.none<S['Type']>();
    }
    const value = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(schema),
    )(text.value).pipe(Effect.mapError(storeFailed(path)));
    return Option.some(value);
  });

/**
 * Runs `write` on a path beside the target and renames the result over it, so
 * a file that exists is always complete.
 */
export const atomically = <E, R>(
  target: string,
  write: (draft: string) => Effect.Effect<unknown, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.dirname(target);
    yield* fs
      .makeDirectory(directory, { recursive: true })
      .pipe(Effect.mapError(storeFailed(directory)));
    // The extension stays last, since ImageMagick reads the format from it.
    const draft = path.join(
      directory,
      `.${crypto.randomUUID()}${path.extname(target)}`,
    );
    yield* write(draft).pipe(
      Effect.andThen(
        fs.rename(draft, target).pipe(Effect.mapError(storeFailed(target))),
      ),
      Effect.ensuring(fs.remove(draft, { force: true }).pipe(Effect.ignore)),
    );
  });

const indentation = 2;

export const writeJson = <S extends Schema.Constraint>(
  schema: S,
  path: string,
  value: S['Type'],
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* Schema.encodeUnknownEffect(
      Schema.fromJsonString(schema, { space: indentation }),
    )(value).pipe(Effect.mapError(storeFailed(path)));
    yield* atomically(path, (draft) =>
      fs
        .writeFileString(draft, `${text}\n`)
        .pipe(Effect.mapError(storeFailed(path))),
    );
  });

export const writeBytes = (target: string, bytes: Uint8Array) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* atomically(target, (draft) =>
      fs.writeFile(draft, bytes).pipe(Effect.mapError(storeFailed(target))),
    );
  });

/** Whether a file of keepsake's own exists already. */
export const exists = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path).pipe(Effect.mapError(storeFailed(path)));
  });

export const readBytes = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFile(path).pipe(Effect.mapError(storeFailed(path)));
  });

const shootsDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  const data = yield* xdgDirectory('XDG_DATA_HOME', '.local/share');
  return path.join(data, 'keepsake', 'shoots');
});

const shootNamePattern = /^[a-z0-9][a-z0-9-]*$/u;

/** Where keepsake keeps everything about one shoot. */
export const shootFiles = Effect.fn('shootFiles')(function* (name: string) {
  if (!shootNamePattern.test(name)) {
    return yield* new InvalidInput({
      message: `A shoot's name has only lowercase letters, digits and hyphens, unlike ${JSON.stringify(name)}.`,
    });
  }
  const path = yield* Path.Path;
  const root = path.join(yield* shootsDirectory, name);
  return {
    root,
    shoot: path.join(root, 'shoot.json'),
    photos: path.join(root, 'photos.json'),
    moments: path.join(root, 'moments.json'),
    picks: path.join(root, 'picks.json'),
    ratings: path.join(root, 'ratings.json'),
    publication: path.join(root, 'publication.json'),
    spending: path.join(root, 'spending.json'),
    lock: path.join(root, 'lock'),
    preview: (photo: string) => path.join(root, 'previews', `${photo}.jpg`),
    verdict: (model: string, moment: string) =>
      path.join(
        root,
        'verdicts',
        model.replaceAll('/', '--'),
        `${moment}.json`,
      ),
    edit: (photo: string) => {
      const directory = path.join(root, 'edits', photo);
      const base = path.basename(photo);
      return {
        directory,
        /** The camera's own full-size JPEG. */
        camera: path.join(directory, `${base}.jpg`),
        crop: path.join(directory, 'crop.json'),
        /** The cropped photo the image model gets. */
        input: path.join(directory, 'input.jpg'),
        version: (number: number) =>
          path.join(directory, `version-${number}.png`),
        final: path.join(directory, `${base}-keepsake.jpg`),
        record: path.join(directory, 'edit.json'),
      };
    },
  };
});
export type ShootFiles = Effect.Success<ReturnType<typeof shootFiles>>;

/** The names of every shoot on this machine. */
export const shootNames = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* shootsDirectory;
  return yield* fs.readDirectory(directory).pipe(
    Effect.catchReason('PlatformError', 'NotFound', () =>
      Effect.succeed([] as Array<string>),
    ),
    Effect.map((names) => names.filter((name) => shootNamePattern.test(name))),
    Effect.mapError(storeFailed(directory)),
  );
});

const needed = <A>(
  value: Option.Option<A>,
  message: string,
): Effect.Effect<A, StepMissing> =>
  Option.match(value, {
    onNone: () => Effect.fail(new StepMissing({ message })),
    onSome: Effect.succeed,
  });

/** A scanned shoot with its photos and moments. */
export const openShoot = Effect.fn('openShoot')(function* (name: string) {
  const files = yield* shootFiles(name);
  const message = `There is no shoot called ${name}. Run \`keepsake scan <folder> --name ${name}\` first; \`keepsake shoots\` lists the ones there are.`;
  const shoot = yield* needed(yield* readJson(Shoot, files.shoot), message);
  const photos = yield* needed(
    yield* readJson(Schema.Array(Photo), files.photos),
    message,
  );
  const moments = yield* needed(
    yield* readJson(Schema.Array(Moment), files.moments),
    message,
  );
  return {
    files,
    shoot,
    photos: new Map(photos.map((photo) => [photo.id, photo] as const)),
    moments,
  };
});
export type OpenShoot = Effect.Success<ReturnType<typeof openShoot>>;

export const readPicks = (files: ShootFiles, name: string) =>
  Effect.gen(function* () {
    return yield* needed(
      yield* readJson(PickList, files.picks),
      `No photos of ${name} are picked yet. Run \`keepsake pick ${name}\` first.`,
    );
  });
