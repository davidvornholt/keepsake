import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai-compat';
import { Effect, Layer, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  type Access,
  type Provider,
  providers,
  readCredentials,
} from './credentials.ts';
import { InvalidInput, NotSignedIn } from './errors/errors.ts';

/** Judges photos unless another model is named. */
export const defaultVisionModel = 'azure/gpt-6-astra';
/** Edits photos unless another model is named. */
export const defaultImageModel = 'azure/gpt-image-2.5-sunburst';

export type ModelName = {
  readonly provider: Provider;
  /** The provider's name for it; on Azure, the name of the deployment. */
  readonly model: string;
};

const isProvider = (name: string): name is Provider =>
  (providers as ReadonlyArray<string>).includes(name);

/** Reads a model's name, such as `azure/gpt-6-astra`. */
export const modelName = Effect.fn('modelName')(function* (name: string) {
  const [provider = '', ...rest] = name.split('/');
  const model = rest.join('/');
  if (!isProvider(provider) || model === '') {
    return yield* new InvalidInput({
      message: `${JSON.stringify(name)} is not a model. Write the provider and the model, such as ${defaultVisionModel}. The providers are ${providers.join(', ')}.`,
    });
  }
  return { provider, model } satisfies ModelName;
});

export const accessTo = Effect.fn('accessTo')(function* (provider: Provider) {
  const { [provider]: access } = yield* readCredentials;
  if (access === undefined) {
    return yield* new NotSignedIn({
      message: `This machine has no API key for ${provider}. Run \`keepsake login ${provider}\` and paste one.`,
    });
  }
  return access;
});

const trailingSlashes = /\/+$/u;

/** Where a provider's API that understands OpenAI's requests is. */
export const openAiUrl = (
  provider: Exclude<Provider, 'anthropic'>,
  access: Access,
): string => {
  switch (provider) {
    case 'azure':
      return `${(access.endpoint ?? '').replace(trailingSlashes, '')}/openai/v1`;
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    case 'openai':
      return 'https://api.openai.com/v1';
    default:
      return provider satisfies never;
  }
};

/** A model that can look at photos, signed in with this machine's key. */
export const visionLayer = (name: ModelName) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const access = yield* accessTo(name.provider);
      const apiKey = Redacted.make(access.apiKey);
      if (name.provider === 'anthropic') {
        return AnthropicLanguageModel.layer({ model: name.model }).pipe(
          Layer.provide(AnthropicClient.layer({ apiKey })),
        );
      }
      return OpenAiLanguageModel.layer({ model: name.model }).pipe(
        Layer.provide(
          OpenAiClient.layer({
            apiKey,
            apiUrl: openAiUrl(name.provider, access),
          }),
        ),
      );
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
