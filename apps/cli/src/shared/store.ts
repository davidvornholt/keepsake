import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Moment, Photo, PickList, Shoot } from './domain.ts';
import { editFiles, editFolderName } from './edit-files.ts';
import { InvalidInput, StepMissing, StoreFailed } from './errors/errors.ts';
import { exclusively } from './lock.ts';
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

/** Where every shoot has its folder. */
export const shootsDirectory = Effect.gen(function* () {
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
  const shoots = yield* shootsDirectory;
  const root = path.join(shoots, name);
  // Beside the shoot's folder, so a shoot can be removed while it is held.
  const locks = path.join(shoots, '..', 'locks');
  return {
    root,
    shoot: path.join(root, 'shoot.json'),
    judge: path.join(root, 'judge.json'),
    photos: path.join(root, 'photos.json'),
    moments: path.join(root, 'moments.json'),
    picks: path.join(root, 'picks.json'),
    /** What the models answered in a pick that hasn't ended yet. */
    pickAnswers: path.join(root, 'pick-answers'),
    /** Why photos that could have been in the album aren't. */
    reasons: path.join(root, 'reasons.json'),
    ratings: path.join(root, 'ratings.json'),
    /** The moments the owner was asked to rate. */
    toRate: path.join(root, 'to-rate.json'),
    publication: path.join(root, 'publication.json'),
    /** What Immich last had in the album, and what was taken out of it. */
    album: path.join(root, 'album.json'),
    removed: path.join(root, 'removed.json'),
    /** What the owner wants, a file for each mark. */
    marks: path.join(root, 'marks'),
    labels: path.join(root, 'labels.json'),
    spending: path.join(root, 'spending.json'),
    /** Held by the command that changes the shoot. */
    lock: path.join(locks, name),
    /** Held while what is in its album is read or changed. */
    albumLock: path.join(locks, `${name}.album`),
    /** What the command that holds the lock is doing. */
    activity: path.join(root, 'activity.json'),
    /** The agent that waits for marks, and the one the page started last. */
    waiting: path.join(root, 'waiting.json'),
    agent: path.join(root, 'agent.json'),
    /** What the owner handed over, a file for each time, and who took it. */
    handOvers: path.join(root, 'hand-overs'),
    /** The program that gets the shoot ready for the owner. */
    preparation: path.join(root, 'preparation.json'),
    previews: path.join(root, 'previews'),
    preview: (photo: string) => path.join(root, 'previews', `${photo}.jpg`),
    verdicts: (model: string) =>
      path.join(root, 'verdicts', model.replaceAll('/', '--')),
    verdict: (model: string, moment: string) =>
      path.join(
        root,
        'verdicts',
        model.replaceAll('/', '--'),
        `${moment}.json`,
      ),
    /** A benchmark's verdict on a moment as it was rated, not as it is now. */
    ratedVerdict: (model: string, moment: string) =>
      path.join(
        root,
        'rated-verdicts',
        model.replaceAll('/', '--'),
        `${moment}.json`,
      ),
    /** The edit command that starts photos over, until it has done all. */
    anew: path.join(root, 'anew.json'),
    edits: path.join(root, 'edits'),
    /** That the edits of photos in folders are no longer nested. */
    flatEdits: path.join(root, 'flat-edits'),
    /** Where they are while they move. */
    unnesting: path.join(root, 'unnesting'),
    edit: (photo: string) => {
      const directory = path.join(root, 'edits', editFolderName(photo));
      const base = path.basename(photo);
      const files = editFiles(path, directory, base);
      const changes = path.join(directory, 'correction');
      return {
        ...files,
        /** A change to the finished photo, which stays until that is done. */
        correction: {
          ...editFiles(path, changes, base),
          camera: files.camera,
          final: files.final,
          /** Where the user wants a change. */
          areas: path.join(changes, 'areas.json'),
          /** What has to change, and where. */
          places: path.join(changes, 'places.json'),
          /** What an attempt starts from, in the size the image model makes. */
          inputOf: (attempt: number) =>
            path.join(changes, `input-${attempt}.jpg`),
          /** The finished photo with the changes of a version. */
          candidate: (attempt: number, number: number) =>
            path.join(changes, `candidate-${attempt}-${number}.png`),
          /** Which of them is best at each place. */
          choices: (attempt: number) =>
            path.join(changes, `choices-${attempt}.json`),
          /** The finished photo with the best of them. */
          result: (attempt: number) =>
            path.join(changes, `result-${attempt}.png`),
          /** What came of it. */
          outcome: path.join(changes, 'outcome.json'),
        },
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

const depth = (photo: string) => photo.split('/').length;

/**
 * Moves the edits of photos in folders out of the edit folder of the photo
 * named like the folder, where they used to be.
 */
const unnestEdits = Effect.fn('unnestEdits')(function* (
  files: ShootFiles,
  photos: ReadonlyArray<string>,
) {
  const nested = photos.filter((photo) => editFolderName(photo) !== photo);
  if (nested.length === 0 || (yield* exists(files.flatEdits))) {
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const staged = (photo: string) =>
    path.join(files.unnesting, editFolderName(photo));
  // First all out of the way, so that none is moved onto one that hasn't
  // moved yet, and the deepest first, so that each is out of its parent.
  const outOfTheWay = Effect.gen(function* () {
    yield* fs.makeDirectory(files.unnesting, { recursive: true });
    for (const photo of nested.toSorted((a, b) => depth(b) - depth(a))) {
      const before = path.join(files.edits, photo);
      const camera = path.join(before, `${path.basename(photo)}.jpg`);
      if ((yield* fs.exists(camera)) && !(yield* fs.exists(staged(photo)))) {
        yield* fs.rename(before, staged(photo));
      }
    }
  });
  /** The folders they were kept in, once nothing is left in them. */
  const emptiedFolders = Effect.gen(function* () {
    for (const photo of nested) {
      let folder = path.dirname(path.join(files.edits, photo));
      while (
        folder !== files.edits &&
        (yield* fs.exists(folder)) &&
        (yield* fs.readDirectory(folder)).length === 0
      ) {
        // Empty, as just seen, and under the shoot's lock.
        yield* fs.remove(folder, { recursive: true });
        folder = path.dirname(folder);
      }
    }
  });
  /** Moves each where it belongs, and tells where other files are in the way. */
  const inPlace = Effect.gen(function* () {
    const blocked: Array<{ photo: string; others: ReadonlyArray<string> }> = [];
    for (const photo of nested) {
      const { directory } = files.edit(photo);
      const isStaged = yield* fs.exists(staged(photo));
      if (isStaged && (yield* fs.exists(directory))) {
        const others = yield* fs.readDirectory(directory, { recursive: true });
        blocked.push({ photo, others: others.toSorted() });
      } else if (isStaged) {
        yield* fs.rename(staged(photo), directory);
      }
    }
    return blocked;
  });
  const moved = Effect.gen(function* () {
    yield* outOfTheWay;
    yield* emptiedFolders;
    const blocked = yield* inPlace;
    // Otherwise the next command goes on with it.
    if (blocked.length === 0) {
      yield* fs.remove(files.unnesting, { recursive: true });
      yield* fs.writeFileString(files.flatEdits, '');
    }
    return blocked;
  }).pipe(Effect.mapError(storeFailed(files.edits)));
  // While another command works on the shoot, they move the next time.
  const blocked = yield* exclusively(files)(moved).pipe(
    Effect.catchTag('ShootBusy', () => Effect.succeed([])),
  );
  if (blocked.length > 0) {
    const where = blocked
      .map(
        ({ photo, others }) =>
          `${files.edit(photo).directory} (${others.join(', ')})`,
      )
      .join('; ');
    return yield* new StoreFailed({
      message: `keepsake keeps the edits of photos in folders apart now, but other files are where they go: ${where}. Move those files elsewhere and run keepsake again; until then the edits wait in ${files.unnesting}.`,
    });
  }
});

/** A scanned shoot with its photos and moments. */
export const openShoot = Effect.fn('openShoot')(function* (name: string) {
  const files = yield* shootFiles(name);
  const message = `There is no shoot called ${name}. Run \`keepsake scan <folder> --name ${name} --title "<album name>"\` first; \`keepsake shoots\` lists the ones there are.`;
  const shoot = yield* needed(yield* readJson(Shoot, files.shoot), message);
  const photos = yield* needed(
    yield* readJson(Schema.Array(Photo), files.photos),
    message,
  );
  yield* unnestEdits(
    files,
    photos.map(({ id }) => id),
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
