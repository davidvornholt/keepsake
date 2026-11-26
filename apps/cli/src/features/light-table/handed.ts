import { createHash } from 'node:crypto';
import { DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { SpendingRecord, totalDollars } from '../../shared/spending.ts';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import { HandOverRecord } from './schemas.ts';

// What the owner handed over: a file for each time, written in one go, and
// beside it the claim of the one agent that acts on it.

const extension = '.json';
const claimed = '.claim';

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({
    message: `Could not use what was handed over: ${error.message}`,
  });

const fileOf = (files: ShootFiles, id: string) =>
  `${files.handOvers}/${id}${extension}`;

const claimOf = (files: ShootFiles, id: string) =>
  `${files.handOvers}/${id}${claimed}`;

const idLength = 8;

/**
 * Puts a file of the hand-overs in place whole, unless one is there already.
 * It is written beside first and linked to where it is found, so that what
 * stops on the way leaves nothing anyone takes for it. Says whether it is
 * this one that is there.
 */
const publish = Effect.fn('publish')(function* (
  files: ShootFiles,
  name: string,
  text: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const draft = `${files.handOvers}/.${name}.${crypto.randomUUID()}`;
  const removeDraft = fs.remove(draft, { force: true }).pipe(Effect.ignore);
  return yield* fs.writeFileString(draft, `${text}\n`).pipe(
    Effect.andThen(fs.link(draft, `${files.handOvers}/${name}`)),
    Effect.as(true),
    Effect.catchReason('PlatformError', 'AlreadyExists', () =>
      Effect.succeed(false),
    ),
    Effect.mapError(storeFailed),
    Effect.ensuring(removeDraft),
  );
});

/** What was spent on the shoot so far. */
export const spentOn = (files: ShootFiles) =>
  Effect.map(readJson(SpendingRecord, files.spending), (record) =>
    Option.match(record, { onNone: () => 0, onSome: totalDollars }),
  );

const readNames = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readDirectory(directory).pipe(
      Effect.catchReason('PlatformError', 'NotFound', () =>
        Effect.succeed([] as Array<string>),
      ),
      Effect.mapError(storeFailed),
    );
  });

// Before hand-overs had a file each, they were a list in hand-overs.json, and
// each mark said when it was handed over. A list like that held no ids of
// marks or photos.
const legacyFile = (files: ShootFiles) => `${files.root}/hand-overs.json`;
const Agreements = Schema.Array(
  Schema.Struct({
    at: Schema.String,
    dollars: Schema.Finite,
    album: Schema.Boolean,
  }),
);
const LegacyMark = Schema.Struct({
  id: Schema.String,
  handedOverAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const legacyMarks = (files: ShootFiles) =>
  Effect.gen(function* () {
    const names = yield* readNames(files.marks);
    const found = yield* Effect.forEach(
      names.filter((name) => name.endsWith(extension) && !name.startsWith('.')),
      (name) => readJson(LegacyMark, `${files.marks}/${name}`),
      { concurrency: 'unbounded' },
    );
    return found.flatMap(Option.toArray);
  });

/**
 * The hand-overs that the old list and the marks tell of: one for each time
 * marks were handed over, with what the owner agreed to pay for them. An
 * album ordered then isn't one, since the list doesn't say which photos it
 * was of, and what was agreed for marks and an album together isn't for the
 * marks alone, so the owner orders the album again and nothing is paid for
 * without them.
 */
const legacyRecords = Effect.fn('legacyRecords')(function* (
  files: ShootFiles,
  agreements: typeof Agreements.Type,
) {
  const handed = Map.groupBy(
    (yield* legacyMarks(files)).flatMap(({ id, handedOverAt }) =>
      handedOverAt === undefined || handedOverAt === null
        ? []
        : [{ id, at: handedOverAt }],
    ),
    ({ at }) => at,
  );
  const spentBefore = yield* spentOn(files);
  return [...handed].map(([at, marks]): HandOverRecord => {
    const agreed = agreements.find((agreement) => agreement.at === at);
    return {
      id: `old${createHash('sha256').update(at).digest('hex').slice(0, idLength)}`,
      at,
      dollars: agreed === undefined || agreed.album ? 0 : agreed.dollars,
      spentBefore,
      marks: marks.map(({ id }) => id).toSorted(),
      album: null,
      fulfilledAt: null,
    };
  });
});

/**
 * Turns the old list of hand-overs into files of their own, once. A file
 * that is there already stays, and the list is kept beside them under
 * another name when all are written, so this can stop anywhere and run again.
 */
const migrate = Effect.fn('migrate')(function* (files: ShootFiles) {
  const agreements = yield* readJson(Agreements, legacyFile(files));
  if (Option.isNone(agreements)) {
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(files.handOvers, { recursive: true })
    .pipe(Effect.mapError(storeFailed));
  for (const record of yield* legacyRecords(files, agreements.value)) {
    const isThere = yield* fs
      .exists(fileOf(files, record.id))
      .pipe(Effect.mapError(storeFailed));
    if (!isThere) {
      yield* saveHandOver(files, record);
    }
  }
  yield* fs
    .rename(legacyFile(files), `${files.root}/hand-overs-before.json`)
    .pipe(
      Effect.catchReason('PlatformError', 'NotFound', () => Effect.void),
      Effect.mapError(storeFailed),
    );
});

/** Everything handed over, oldest first. */
export const readHandOvers = Effect.fn('readHandOvers')(function* (
  files: ShootFiles,
) {
  yield* migrate(files);
  const names = yield* readNames(files.handOvers);
  const found = yield* Effect.forEach(
    names.filter((name) => name.endsWith(extension) && !name.startsWith('.')),
    (name) => readJson(HandOverRecord, `${files.handOvers}/${name}`),
    { concurrency: 'unbounded' },
  );
  return found
    .flatMap(Option.toArray)
    .toSorted((left, right) => left.at.localeCompare(right.at));
});

export const saveHandOver = (files: ShootFiles, record: HandOverRecord) =>
  writeJson(HandOverRecord, fileOf(files, record.id), record);

/**
 * Who took a hand-over: an agent that waited for it, which has it then, or
 * the page, which has it once the program it started an agent with said so.
 */
const Claim = Schema.Struct({
  by: Schema.Literals(['waiter', 'page']),
  at: Schema.String,
  isAcknowledged: Schema.Boolean,
});
export type Claim = typeof Claim.Type;

/**
 * Takes a hand-over for one agent. False when another one took it already,
 * since only one may act on it.
 */
export const claim = Effect.fn('claim')(function* (
  files: ShootFiles,
  id: string,
  by: Claim['by'],
) {
  const taken: Claim = {
    by,
    at: DateTime.formatIso(yield* DateTime.now),
    isAcknowledged: by === 'waiter',
  };
  const text = yield* Schema.encodeEffect(Schema.fromJsonString(Claim))(
    taken,
  ).pipe(Effect.mapError(storeFailed));
  return yield* publish(files, `${id}${claimed}`, text);
});

export const claimOn = (files: ShootFiles, id: string) =>
  Effect.map(readJson(Claim, claimOf(files, id)), Option.getOrNull);

/** Notes that the program the page started an agent with said it did. */
export const acknowledge = Effect.fn('acknowledge')(function* (
  files: ShootFiles,
  id: string,
) {
  const taken = yield* claimOn(files, id);
  if (taken !== null) {
    yield* writeJson(Claim, claimOf(files, id), {
      ...taken,
      isAcknowledged: true,
    });
  }
});
