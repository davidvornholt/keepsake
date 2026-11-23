import { Effect, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import type { Access, Provider } from '../../shared/credentials.ts';
import {
  InvalidInput,
  ModelFailed,
  NotSignedIn,
} from '../../shared/errors/errors.ts';
import { openAiUrl } from '../../shared/models.ts';

const anthropicModels = 'https://api.anthropic.com/v1/models';

const modelsRequest = (provider: Provider, access: Access) => {
  if (provider === 'anthropic') {
    return HttpClientRequest.get(anthropicModels).pipe(
      HttpClientRequest.setHeaders({
        'x-api-key': access.apiKey,
        'anthropic-version': '2023-06-01',
      }),
    );
  }
  return HttpClientRequest.get(`${openAiUrl(provider, access)}/models`).pipe(
    HttpClientRequest.bearerToken(access.apiKey),
  );
};

const Models = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: Schema.String })),
});

const okStatus = 200;
const badRequest = 400;
const unauthorized = 401;
const forbidden = 403;
const refusals = new Set([badRequest, unauthorized, forbidden]);

/** Checks with the provider that it accepts the key. */
export const checkAccess = Effect.fn('checkAccess')(function* (
  provider: Provider,
  access: Access,
) {
  const client = yield* HttpClient.HttpClient;
  const failed = (message: string) =>
    new ModelFailed({ message: `${provider}: ${message}` });
  const response = yield* client
    .execute(modelsRequest(provider, access))
    .pipe(Effect.mapError((error) => failed(error.message)));
  if (refusals.has(response.status)) {
    return yield* new NotSignedIn({
      message: `${provider} does not accept this API key. Check that the whole key was pasted${provider === 'azure' ? ', and that it belongs to the resource at --endpoint' : ''}. The key stored before, if any, is unchanged.`,
    });
  }
  if (response.status !== okStatus) {
    return yield* failed(`answered ${response.status}.`);
  }
  const { data } = yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Models)),
    Effect.mapError((error) => failed(error.message)),
  );
  return data.length;
}, Effect.provide(FetchHttpClient.layer));

const trailingSlashes = /\/+$/u;

/** The address of an Azure resource, without a path. */
export const azureEndpoint = Effect.fn('azureEndpoint')(function* (
  text: string,
) {
  const url = yield* Effect.try({
    try: () => new URL(text.trim()),
    catch: () =>
      new InvalidInput({
        message: `${JSON.stringify(text)} is not an address. Pass the endpoint of the Azure resource, such as https://example.openai.azure.com.`,
      }),
  });
  if (url.protocol !== 'https:') {
    return yield* new InvalidInput({
      message: 'The endpoint must start with https://.',
    });
  }
  return url.origin.replace(trailingSlashes, '');
});
