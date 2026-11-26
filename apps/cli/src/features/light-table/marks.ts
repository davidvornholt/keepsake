import { DateTime, Effect, FileSystem, Option } from 'effect';
import { InvalidInput, StoreFailed } from '../../shared/errors/errors.ts';
import {
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeJson,
} from '../../shared/store.ts';
import { readHandOvers } from './handed.ts';
import { type Mark, type NewMark, SavedMark } from './schemas.ts';

const idPattern = /^[a-z0-9]+$/u;
const idLength = 8;
const extension = '.json';

const now = Effect.map(DateTime.now, DateTime.formatIso);

const fileOf = (files: ShootFiles, id: string) =>
  `${files.marks}/${id}${extension}`;

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use the marks: ${error.message}` });

/**
 * Every mark of a shoot, oldest first. A mark is handed over once a hand-over
 * that names it is saved, and not before.
 */
export const readMarks = Effect.fn('readMarks')(function* (files: ShootFiles) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(files.marks).pipe(
    Effect.catchReason('PlatformError', 'NotFound', () =>
      Effect.succeed([] as Array<string>),
    ),
    Effect.mapError(storeFailed),
  );
  const marks = yield* Effect.forEach(
    names.filter((name) => name.endsWith(extension) && !name.startsWith('.')),
    (name) => readJson(SavedMark, `${files.marks}/${name}`),
    { concurrency: 'unbounded' },
  );
  const handedAt = new Map(
    (yield* readHandOvers(files)).flatMap(({ at, marks: ids }) =>
      ids.map((id) => [id, at] as const),
    ),
  );
  return marks
    .flatMap(Option.toArray)
    .map(
      (mark): Mark => ({
        ...mark,
        handedOverAt: handedAt.get(mark.id) ?? null,
      }),
    )
    .toSorted((left, right) => left.madeAt.localeCompare(right.madeAt));
});

export const saveMark = (files: ShootFiles, mark: SavedMark) =>
  writeJson(SavedMark, fileOf(files, mark.id), mark);

const remove = (files: ShootFiles, { id }: Mark) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .remove(fileOf(files, id), { force: true })
      .pipe(Effect.mapError(storeFailed));
  });

/** Marks the owner can still take back. */
export const isOpen = ({ handedOverAt }: Mark): boolean =>
  handedOverAt === null;

/** Marks an agent is to act on. */
export const isWaiting = ({ handedOverAt, answer }: Mark): boolean =>
  handedOverAt !== null && answer === null;

/** Marks that were answered, and whose photo wasn't looked at since. */
export const isNews = ({ answer, seenAt }: Mark): boolean =>
  answer !== null && seenAt === null;

/** Notes that the owner looked at what came of earlier marks of a photo. */
const seeAll = Effect.fn('seeAll')(function* (
  files: ShootFiles,
  marks: ReadonlyArray<Mark>,
) {
  const seenAt = yield* now;
  yield* Effect.forEach(marks.filter(isNews), (mark) =>
    saveMark(files, { ...mark, seenAt }),
  );
});

/** Makes a mark in place of one that isn't handed over yet. */
export const makeMark = Effect.fn('makeMark')(function* (
  open: OpenShoot,
  wanted: NewMark,
) {
  const { photo, kind, note, boxes, other } = wanted;
  const needsOther = kind === 'swap';
  if (
    !open.photos.has(photo) ||
    (needsOther ? other === null || !open.photos.has(other) : other !== null)
  ) {
    return yield* new InvalidInput({
      message: 'The mark is about photos the shoot doesn’t have.',
    });
  }
  const all = yield* readMarks(open.files);
  const own = all.filter((one) => one.photo === photo);
  const mark: Mark = {
    id: crypto.randomUUID().replaceAll('-', '').slice(0, idLength),
    photo,
    kind,
    note: note.trim(),
    boxes,
    other,
    madeAt: yield* now,
    handedOverAt: null,
    answer: null,
    seenAt: null,
  };
  yield* saveMark(open.files, mark);
  yield* Effect.forEach(own.filter(isOpen), (one) => remove(open.files, one));
  yield* seeAll(open.files, own);
  return mark;
});

/** The mark with this id. */
export const markWith = Effect.fn('markWith')(function* (
  files: ShootFiles,
  id: string,
) {
  const mark = idPattern.test(id)
    ? (yield* readMarks(files)).find((one) => one.id === id)
    : undefined;
  if (mark === undefined) {
    return yield* new InvalidInput({ message: `There is no mark ${id}.` });
  }
  return mark;
});

/** Takes back a mark that isn't handed over yet. */
export const takeBack = Effect.fn('takeBack')(function* (
  files: ShootFiles,
  id: string,
) {
  const mark = yield* markWith(files, id);
  if (!isOpen(mark)) {
    return yield* new InvalidInput({
      message: 'The mark is handed over already.',
    });
  }
  yield* remove(files, mark);
});

/** Notes what an agent did about a mark. */
export const answerMark = Effect.fn('answerMark')(function* (
  files: ShootFiles,
  id: string,
  {
    outcome,
    note,
  }: { readonly outcome: 'done' | 'not-done'; readonly note: string },
) {
  const mark = yield* markWith(files, id);
  if (isOpen(mark)) {
    return yield* new InvalidInput({
      message: `The mark ${id} isn’t handed over yet, so the owner may still change it.`,
    });
  }
  const answered: Mark = {
    ...mark,
    answer: { outcome, note, at: yield* now },
    seenAt: null,
  };
  yield* saveMark(files, answered);
  return answered;
});

/** Notes that the owner looked at what came of a mark. */
export const seeMark = Effect.fn('seeMark')(function* (
  files: ShootFiles,
  id: string,
) {
  yield* seeAll(files, [yield* markWith(files, id)]);
});
