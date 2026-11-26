import { Context, Effect, Layer, Schedule, type Schema } from 'effect';
import { type AiError, LanguageModel, Prompt } from 'effect/ai';
import { ModelFailed } from './errors/errors.ts';
import { modelName, visionLayer } from './models.ts';
import { Spending } from './spending.ts';

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

export type VisionModel = {
  /** The model's name with its provider. */
  readonly model: string;
  /** Asks about photos and answers in the question's shape. */
  readonly ask: <S extends AnswerSchema>(
    question: Question<S>,
  ) => Effect.Effect<S['Type'], ModelFailed>;
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
          const response = yield* language
            .generateObject({
              objectName: question.name,
              schema: question.schema,
              prompt: Prompt.make([
                { role: 'system', content: question.role },
                Prompt.userMessage({ content: question.pieces.map(part) }),
              ]),
            })
            .pipe(
              Effect.retry({
                while: (error) => error.isRetryable,
                schedule: backoff,
                times: retries,
              }),
              Effect.mapError(modelFailed(model)),
            );
          const { inputTokens, outputTokens } = response.usage;
          yield* spending.add(
            model,
            inputTokens.total ?? 0,
            outputTokens.total ?? 0,
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
