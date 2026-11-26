import { createHash } from 'node:crypto';
import { Effect, FileSystem, Option } from 'effect';
import { rendered } from '../../shared/pictures.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
import { type AnswerSchema, type Piece, Vision } from '../../shared/vision.ts';

const picturesAtOnce = 4;

/** A photo shown in a question, by its preview at this size. */
type Shown = { readonly photo: string; readonly longSide: number };

type Question<S extends AnswerSchema> = {
  readonly role: string;
  readonly name: string;
  readonly schema: S;
  readonly pieces: ReadonlyArray<string | Shown>;
};

const whereKept = (open: OpenShoot, model: string, question: object) => {
  const key = createHash('sha256')
    .update(JSON.stringify([model, question]))
    .digest('hex');
  return `${open.files.pickAnswers}/${key}.json`;
};

/**
 * Asks the vision model, unless it gave an answer to the same question in a
 * pick that stopped before its end. Each answer is kept as soon as it comes,
 * since it cost money, until the pick is done.
 */
export const askOnce = Effect.fn('askOnce')(function* <S extends AnswerSchema>(
  open: OpenShoot,
  question: Question<S>,
) {
  const vision = yield* Vision;
  const { role, name, schema, pieces } = question;
  const file = whereKept(open, vision.model, { role, name, pieces });
  const before = yield* readJson(schema, file);
  if (Option.isSome(before)) {
    return before.value;
  }
  const shown = yield* Effect.forEach(
    pieces,
    (piece) =>
      typeof piece === 'string'
        ? Effect.succeed<Piece>(piece)
        : rendered(open.files.preview(piece.photo), {
            longSide: piece.longSide,
          }),
    { concurrency: picturesAtOnce },
  );
  const answer = yield* vision.ask({ role, name, schema, pieces: shown });
  yield* writeJson(schema, file, answer);
  return answer;
});

/** Forgets the answers of a pick that is done or starts over. */
export const forgetAnswers = (open: OpenShoot) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs
      .remove(open.files.pickAnswers, { recursive: true, force: true })
      .pipe(Effect.ignore);
  });
