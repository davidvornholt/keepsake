// biome-ignore-all lint/style/useNamingConvention: the API's names for what it answers
import { Context, Effect, Layer, Schedule, Schema, Semaphore } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from 'effect/http';
import {
  InvalidInput,
  ModelFailed,
  PhotoRefused,
  TryLater,
} from '../../shared/errors/errors.ts';
import { accessTo, modelName, openAiUrl } from '../../shared/models.ts';
import type { Size } from '../../shared/pictures.ts';
import { Spending } from '../../shared/spending.ts';

/** How many requests run at once; image models allow only a few. */
const concurrency = 3;
const retries = 8;
const growth = 1.5;
const backoff = Schedule.exponential('10 seconds', growth).pipe(
  Schedule.jittered,
);

const Images = Schema.Struct({
  data: Schema.Array(Schema.Struct({ b64_json: Schema.Uint8ArrayFromBase64 })),
  usage: Schema.optionalKey(
    Schema.Struct({
      input_tokens: Schema.Int,
      output_tokens: Schema.Int,
    }),
  ),
});

const Problem = Schema.Struct({
  error: Schema.Struct({
    code: Schema.optionalKey(Schema.NullOr(Schema.String)),
    message: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
});

export type ImageEdit = {
  /** The photo to edit, as a JPEG. */
  readonly picture: Uint8Array<ArrayBuffer>;
  readonly prompt: string;
  readonly size: Size;
  readonly versions: number;
};

const okStatus = 200;
const badRequest = 400;
const tooManyRequests = 429;
const firstServerError = 500;

const refusalCodes = new Set([
  'moderation_blocked',
  'content_policy_violation',
  'content_filter',
]);

/** Turns an answer into the images in it, or says what went wrong. */
const readAnswer = (
  model: string,
  response: HttpClientResponse.HttpClientResponse,
) =>
  Effect.gen(function* () {
    const body = yield* response.json.pipe(
      Effect.mapError(
        (error) => new TryLater({ message: `${model}: ${error.message}` }),
      ),
    );
    if (response.status === okStatus) {
      return yield* Schema.decodeUnknownEffect(Images)(body).pipe(
        Effect.mapError(
          () =>
            new ModelFailed({
              message: `${model} answered without an image.`,
            }),
        ),
      );
    }
    const problem = yield* Schema.decodeUnknownEffect(Problem)(body).pipe(
      Effect.map(({ error }) => error),
      Effect.orElseSucceed(() => ({ code: null, message: null })),
    );
    const message = `${model} answered ${response.status}: ${problem.message ?? 'no reason given'}`;
    if (
      response.status === badRequest &&
      refusalCodes.has(problem.code ?? '')
    ) {
      return yield* new PhotoRefused({ message });
    }
    return yield* response.status === tooManyRequests ||
    response.status >= firstServerError
      ? new TryLater({ message })
      : new ModelFailed({ message });
  });

/** The model that edits photos in this command. */
export class ImageModel extends Context.Service<
  ImageModel,
  {
    /** The model's name with its provider. */
    readonly model: string;
    /** Edits a photo and returns the versions as PNG files. */
    readonly edit: (
      edit: ImageEdit,
    ) => Effect.Effect<ReadonlyArray<Uint8Array>, ModelFailed | PhotoRefused>;
  }
>()('@keepsake/cli/features/edit/ImageModel') {
  static readonly layer = (model: string) =>
    Layer.effect(
      ImageModel,
      Effect.gen(function* () {
        const name = yield* modelName(model);
        if (name.provider !== 'azure' && name.provider !== 'openai') {
          return yield* new InvalidInput({
            message: `keepsake can't edit photos with ${model}. Use an image model of azure or openai.`,
          });
        }
        const access = yield* accessTo(name.provider);
        const client = yield* HttpClient.HttpClient;
        const spending = yield* Spending;
        const turns = yield* Semaphore.make(concurrency);
        const address = `${openAiUrl(name.provider, access)}/images/edits${
          name.provider === 'azure' ? '?api-version=preview' : ''
        }`;
        const request = ({ picture, prompt, size, versions }: ImageEdit) => {
          const form = new FormData();
          form.append('model', name.model);
          form.append('prompt', prompt);
          form.append('n', String(versions));
          form.append('size', `${size.width}x${size.height}`);
          form.append('quality', 'xhigh');
          form.append('output_format', 'png');
          form.append(
            'image[]',
            new Blob([picture], { type: 'image/jpeg' }),
            'photo.jpg',
          );
          return HttpClientRequest.post(address).pipe(
            HttpClientRequest.bearerToken(access.apiKey),
            HttpClientRequest.bodyFormData(form),
          );
        };
        const edit = Effect.fn('ImageModel.edit')(function* (
          wanted: ImageEdit,
        ) {
          const answer = yield* client.execute(request(wanted)).pipe(
            Effect.mapError(
              (error) =>
                new TryLater({ message: `${model}: ${error.message}` }),
            ),
            Effect.flatMap((response) => readAnswer(model, response)),
            // Only the request takes a turn, not the wait before another try.
            turns.withPermits(1),
            Effect.retry({
              while: (error) => error._tag === 'TryLater',
              schedule: backoff,
              times: retries,
            }),
            Effect.catchTag('TryLater', ({ message }) =>
              Effect.fail(new ModelFailed({ message })),
            ),
          );
          // Also an answer without images, which may have been paid for.
          yield* spending.add(
            model,
            answer.usage?.input_tokens ?? 0,
            answer.usage?.output_tokens ?? 0,
          );
          if (answer.data.length === 0) {
            return yield* new ModelFailed({
              message: `${model} answered without an image.`,
            });
          }
          return answer.data.map(({ b64_json: image }) => image);
        });
        return ImageModel.of({ model, edit });
      }),
    ).pipe(Layer.provide(FetchHttpClient.layer));
}
