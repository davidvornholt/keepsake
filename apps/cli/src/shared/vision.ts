import { Context, Effect, Exit, Layer, Schedule, type Schema } from 'effect';
import {
  AiError,
  LanguageModel,
  Prompt,
  type Response,
  Telemetry,
} from 'effect/ai';
import {
  ModelFailed,
  type OverBudget,
  type StoreFailed,
} from './errors/errors.ts';
import { AnswerBegins, AnswerLost, modelName, visionLayer } from './models.ts';
import { bytesOf, type RequestSize, type Usage } from './prices.ts';
import { type Paid, Spending } from './spending.ts';

/** One piece of a question: text, or a photo as JPEG bytes. */
export type Piece = string | Uint8Array;

/** The shape of an answer: a struct without services. */
export type AnswerSchema = Schema.Codec<unknown, Record<string, unknown>>;

export type Question<S extends AnswerSchema> = {
  /** Who the model is and what it decides, the same for every question. */
  readonly role: string;
  readonly pieces: ReadonlyArray<Piece>;
  /** A short name for the answer, such as `verdict`. */
  readonly name: string;
  readonly schema: S;
};

const part = (piece: Piece) =>
  typeof piece === 'string'
    ? Prompt.textPart({ text: piece })
    : Prompt.filePart({
        mediaType: 'image/jpeg',
        data: piece,
        options: { 'openai-compat': { imageDetail: 'high' } },
      });

const retries = 6;
/** Waits 4 s, 8 s, 16 s and so on, a little apart from other requests. */
const backoff = Schedule.exponential('4 seconds').pipe(Schedule.jittered);

const modelFailed = (model: string) => (error: AiError.AiError) =>
  new ModelFailed({ message: `${model}: ${error.message}` });

/** What an answer used, unless it doesn't say. */
const usageOf = ({
  inputTokens,
  outputTokens,
}: Response.Usage): Usage | undefined =>
  inputTokens.total === undefined || outputTokens.total === undefined
    ? undefined
    : { inputTokens: inputTokens.total, outputTokens: outputTokens.total };

/** Whether a model answered, but not in the shape asked for. */
const isMalformed = (error: { readonly _tag: string }): boolean =>
  error instanceof AiError.AiError &&
  (error.reason._tag === 'StructuredOutputError' ||
    error.reason._tag === 'InvalidOutputError');

/** What a question sends, as far as it bounds what it can cost. */
const sizeOf = ({ role, pieces }: Question<AnswerSchema>): RequestSize => ({
  text:
    bytesOf(role) +
    pieces.reduce(
      (sum, piece) => sum + (typeof piece === 'string' ? bytesOf(piece) : 0),
      0,
    ),
  pictures: pieces.filter((piece) => typeof piece !== 'string').length,
  versions: 1,
});

type Seen = { began: boolean; answered: boolean; usage?: Response.Usage };

/**
 * Watches a request: counts it at its most once its answer begins or when it
 * may have been paid for without an answer, and sees
 * the answer before its shape is checked, so an answer of the wrong shape is
 * counted as what it used. A write that fails when the answer begins is
 * tried again, and reported, when the request settles or the step ends.
 */
const watching =
  (paid: Paid, seen: Seen) =>
  <A, E, R>(request: Effect.Effect<A, E, R>) =>
    request.pipe(
      Effect.provideService(
        AnswerBegins,
        Effect.sync(() => {
          seen.began = true;
        }).pipe(Effect.andThen(paid.answered), Effect.ignore),
      ),
      Effect.provideService(AnswerLost, Effect.ignore(paid.answered)),
      Effect.provideService(
        Telemetry.CurrentSpanTransformer,
        ({ response: pieces }) => {
          seen.answered = true;
          for (const piece of pieces) {
            if (piece.type === 'finish') {
              seen.usage = piece.usage;
            }
          }
        },
      ),
    );

/** Asks once, and counts what the answer cost however it ends. */
const askOnce =
  <S extends AnswerSchema>(
    language: LanguageModel.LanguageModel,
    model: string,
    question: Question<S>,
  ) =>
  (paid: Paid) =>
    Effect.gen(function* () {
      const seen: Seen = { began: false, answered: false };
      const exit = yield* language
        .generateObject({
          objectName: question.name,
          schema: question.schema,
          prompt: Prompt.make([
            { role: 'system', content: question.role },
            Prompt.userMessage({ content: question.pieces.map(part) }),
          ]),
        })
        .pipe(watching(paid, seen), Effect.exit);
      if (seen.answered) {
        yield* paid.settle(
          seen.usage === undefined ? undefined : usageOf(seen.usage),
        );
      } else if (seen.began && Exit.isFailure(exit)) {
        return yield* new ModelFailed({
          message: `${model} answered, but its answer couldn't be read. It may have cost up to $${paid.most.toFixed(2)}, which is counted as spent, so keepsake didn't ask again.`,
        });
      }
      return yield* exit;
    });

export type VisionModel = {
  /** The model's name with its provider. */
  readonly model: string;
  /** Asks about photos and answers in the question's shape. */
  readonly ask: <S extends AnswerSchema>(
    question: Question<S>,
  ) => Effect.Effect<S['Type'], ModelFailed | OverBudget | StoreFailed>;
};

/** The model that looks at photos in this command. */
export class Vision extends Context.Service<Vision, VisionModel>()(
  '@keepsake/cli/shared/Vision',
) {
  static readonly layer = (model: string) =>
    Layer.effect(
      Vision,
      Effect.gen(function* () {
        const language = yield* LanguageModel.LanguageModel;
        const spending = yield* Spending;
        const ask = Effect.fn('Vision.ask')(function* <S extends AnswerSchema>(
          question: Question<S>,
        ) {
          const response = yield* spending
            .paying(model, sizeOf(question), askOnce(language, model, question))
            .pipe(
              // An answer of the wrong shape is asked for again at once, and
              // a busy model later. Each try is paid for.
              Effect.retry({ while: isMalformed, times: 1 }),
              Effect.retry({
                while: (error) =>
                  error._tag === 'AiError' &&
                  error.isRetryable &&
                  !isMalformed(error),
                schedule: backoff,
                times: retries,
              }),
              Effect.mapError((error) =>
                error._tag === 'AiError' ? modelFailed(model)(error) : error,
              ),
            );
          return response.value;
        });
        return Vision.of({ model, ask });
      }),
    ).pipe(
      Layer.provide(
        Layer.unwrap(Effect.map(modelName(model), (name) => visionLayer(name))),
      ),
    );
}
