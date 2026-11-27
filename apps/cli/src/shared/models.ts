import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai-compat';
import { Context, Effect, Layer, Redacted } from 'effect';
import { FetchHttpClient, HttpClient, type HttpClientError } from 'effect/http';
import {
  type Access,
  type Provider,
  providers,
  readCredentials,
} from './credentials.ts';
import { InvalidInput, NotSignedIn } from './errors/errors.ts';
import { mostCostOf, outputLimitOf } from './prices.ts';
import { claude } from './subscriptions/claude.ts';
import { codex } from './subscriptions/codex.ts';
import { programModelLayer } from './subscriptions/program-model.ts';
import {
  type Effort,
  efforts,
  isEffort,
  isSubscription,
  type Subscription,
  subscriptions,
} from './subscriptions/subscriptions.ts';

/** Judges photos unless another model is named or has judged them before. */
export const defaultVisionModel = 'codex/gpt-6.2-sol';
/** Looks after the edits unless another model is named. */
export const defaultReviewModel = 'claude/claude-opus-5-5';
/** Edits photos unless another model is named. */
export const defaultImageModel = 'azure/gpt-image-2.5-sunburst';
/** How many versions of a photo the image model makes unless told otherwise. */
export const defaultVersions = 2;

/** Bytes that the prompt of an edit stays within, for what it can cost. */
const longestPrompt = 8000;

/**
 * What keepsake holds back of a budget before it sends one edit with the
 * default image model: the most that request can cost.
 */
export const holdForOneEdit =
  mostCostOf(defaultImageModel, {
    text: longestPrompt,
    pictures: 1,
    versions: defaultVersions,
  }) ?? 0;

/** How long a subscription's model thinks unless its name says otherwise. */
const usualEffort = 'medium';

export type ModelName =
  | {
      readonly provider: Provider;
      /** The provider's name for it; on Azure, the name of the deployment. */
      readonly model: string;
    }
  | {
      readonly provider: Subscription;
      readonly model: string;
      readonly effort: Effort;
    };

const isProvider = (name: string): name is Provider =>
  (providers as ReadonlyArray<string>).includes(name);

const subscriptionModel = Effect.fn('subscriptionModel')(function* (
  provider: Subscription,
  name: string,
) {
  const [model = '', effort = usualEffort] = name.split('@', 2);
  if (model === '' || !isEffort(effort)) {
    return yield* new InvalidInput({
      message: `${JSON.stringify(`${provider}/${name}`)} is not a model. Write the model, and @ with an effort if it should be another one than ${usualEffort}. The efforts are ${efforts.join(', ')}.`,
    });
  }
  return { provider, model, effort } satisfies ModelName;
});

/** Reads a model's name, such as `azure/gpt-6-astra`. */
export const modelName = Effect.fn('modelName')(function* (name: string) {
  const [provider = '', ...rest] = name.split('/');
  const model = rest.join('/');
  if (isSubscription(provider)) {
    return yield* subscriptionModel(provider, model);
  }
  if (!isProvider(provider) || model === '') {
    return yield* new InvalidInput({
      message: `${JSON.stringify(name)} is not a model. Write the provider and the model, such as ${defaultVisionModel}. The providers are ${[...providers, ...subscriptions].join(', ')}.`,
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

/**
 * Runs when a model's answer begins to arrive, before it is read: from then
 * on the request is paid for, even if its answer can't be read.
 */
export const AnswerBegins = Context.Reference<Effect.Effect<void>>(
  '@keepsake/cli/shared/AnswerBegins',
  { defaultValue: () => Effect.void },
);

/**
 * Runs when a request that may have been paid for ends without an answer:
 * its connection broke off, or keepsake stopped while it waited.
 */
export const AnswerLost = Context.Reference<Effect.Effect<void>>(
  '@keepsake/cli/shared/AnswerLost',
  { defaultValue: () => Effect.void },
);

/**
 * What fetch says when a request couldn't reach the provider at all: the
 * name or the host wasn't found, nothing listened, or the TLS handshake or
 * the certificate failed before anything was sent.
 */
const unreached = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPROTO',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

/**
 * Whether a request that failed without an answer may have been paid for:
 * the provider may have got it before the connection broke off, and charges
 * it all the same.
 */
export const mayBePaidFor = ({
  reason,
}: HttpClientError.HttpClientError): boolean => {
  if (reason._tag !== 'TransportError' || reason.cause === undefined) {
    return false;
  }
  const { cause } = reason;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined;
  return !(typeof code === 'string' && unreached.has(code));
};

const okStatus = 200;

const tellingWhenAnswered = (client: HttpClient.HttpClient) =>
  HttpClient.transform(client, (answer) =>
    answer.pipe(
      Effect.tap((response) =>
        response.status === okStatus
          ? Effect.flatten(AnswerBegins)
          : Effect.void,
      ),
      Effect.tapError((error) =>
        mayBePaidFor(error) ? Effect.flatten(AnswerLost) : Effect.void,
      ),
      Effect.onInterrupt(() => Effect.flatten(AnswerLost)),
    ),
  );

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

const apiLayer = (provider: Provider, model: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const access = yield* accessTo(provider);
      const apiKey = Redacted.make(access.apiKey);
      if (provider === 'anthropic') {
        return AnthropicLanguageModel.layer({ model }).pipe(
          Layer.provide(
            AnthropicClient.layer({
              apiKey,
              transformClient: tellingWhenAnswered,
            }),
          ),
        );
      }
      // A paid model may answer only as much as the budget counted on.
      const limit = outputLimitOf(`${provider}/${model}`);
      return OpenAiLanguageModel.layer({
        model,
        config:
          limit === undefined
            ? undefined
            : // biome-ignore lint/style/useNamingConvention: the API's name
              { max_completion_tokens: limit },
      }).pipe(
        Layer.provide(
          OpenAiClient.layer({
            apiKey,
            apiUrl: openAiUrl(provider, access),
            transformClient: tellingWhenAnswered,
          }),
        ),
      );
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

/**
 * A model that can look at photos, with this machine's API key or on the
 * subscription its program is signed in to.
 */
export const visionLayer = (name: ModelName) => {
  switch (name.provider) {
    case 'claude':
      return programModelLayer(claude(name.model, name.effort));
    case 'codex':
      return programModelLayer(codex(name.model, name.effort));
    default:
      return apiLayer(name.provider, name.model);
  }
};
