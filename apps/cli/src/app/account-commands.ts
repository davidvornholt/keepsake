import { Effect, Option, Redacted, Stdio, Stream } from 'effect';
import { Argument, Command, Prompt } from 'effect/cli';
import { azureEndpoint, checkAccess } from '../features/account/account.ts';
import {
  forgetAccess,
  type Provider,
  providers,
  readCredentials,
  saveAccess,
} from '../shared/credentials.ts';
import {
  isSignedInTo,
  subscriptions,
} from '../shared/subscriptions/subscriptions.ts';
import { fail, optionalString } from './command-inputs.ts';
import { emit } from './output.ts';

// An API key is one word; anything with spaces is a paste gone wrong.
const whitespace = /\s/u;

const providerArgument = Argument.Literals('provider', providers).pipe(
  Argument.withDescription('Whose models the key is for'),
);

const noKey = (provider: Provider) => () =>
  fail(
    `No API key arrived. Paste it when asked, or pipe it in: keepsake login ${provider} < key-file`,
  );

/**
 * The key, typed hidden at a terminal or piped in, so it never appears in
 * the shell history or the process list.
 */
const readKey = Effect.fn('readKey')(function* (provider: Provider) {
  const stdio = yield* Stdio.Stdio;
  if (yield* stdio.stdinIsTerminal) {
    const key = yield* Prompt.run(
      Prompt.Hidden({ message: `API key for ${provider}` }),
    ).pipe(Effect.catchTag('QuitError', noKey(provider)));
    return Redacted.value(key).trim();
  }
  return yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.map((text) => text.trim()),
    Effect.catchTag('PlatformError', noKey(provider)),
  );
});

/** The address of the Azure resource, or null for other providers. */
const endpointFor = Effect.fn('endpointFor')(function* (
  provider: Provider,
  endpoint: Option.Option<string>,
) {
  if (provider !== 'azure') {
    return Option.isSome(endpoint)
      ? yield* fail('Only azure has an --endpoint.')
      : null;
  }
  if (Option.isSome(endpoint)) {
    return yield* azureEndpoint(endpoint.value);
  }
  const { azure } = yield* readCredentials;
  return (
    azure?.endpoint ??
    (yield* fail(
      'Pass --endpoint with the address of your Azure resource, such as https://example.openai.azure.com.',
    ))
  );
});

export const login = Command.make(
  'login',
  {
    provider: providerArgument,
    endpoint: optionalString(
      'endpoint',
      'The address of the Azure resource, for azure only. Defaults to the one this machine used before.',
    ),
  },
  ({ provider, endpoint }) =>
    Effect.gen(function* () {
      const address = yield* endpointFor(provider, endpoint);
      const apiKey = yield* readKey(provider);
      if (apiKey === '') {
        return yield* noKey(provider)();
      }
      if (whitespace.test(apiKey)) {
        return yield* fail(
          'That is not an API key: it contains spaces or line breaks. Paste only the key.',
        );
      }
      const access = { endpoint: address, apiKey };
      // Checked before it is saved, so a typo never replaces a working key.
      const models = yield* checkAccess(provider, access);
      yield* saveAccess(provider, access);
      yield* emit({ provider, signedIn: true, endpoint: address, models });
    }),
).pipe(
  Command.withDescription(
    'Store an API key for a provider of models on this machine after checking it. Reads the key hidden from the terminal, or from stdin.',
  ),
);

export const logout = Command.make(
  'logout',
  { provider: providerArgument },
  ({ provider }) =>
    Effect.gen(function* () {
      const removedKey = yield* forgetAccess(provider);
      yield* emit({ provider, signedIn: false, removedKey });
    }),
).pipe(
  Command.withDescription("Remove a provider's API key from this machine"),
);

export const status = Command.make('status', {}, () =>
  Effect.gen(function* () {
    const credentials = yield* readCredentials;
    const accounts = yield* Effect.forEach(
      providers,
      (provider) =>
        Effect.gen(function* () {
          const access = credentials[provider];
          if (access === undefined) {
            return { provider, signedIn: false };
          }
          return yield* checkAccess(provider, access).pipe(
            Effect.as({ provider, signedIn: true }),
            Effect.catch(({ message }) =>
              Effect.succeed({ provider, signedIn: false, problem: message }),
            ),
          );
        }),
      { concurrency: 'unbounded' },
    );
    const programs = yield* Effect.forEach(
      subscriptions,
      (provider) =>
        Effect.map(isSignedInTo(provider), (signedIn) => ({
          provider,
          signedIn,
        })),
      { concurrency: 'unbounded' },
    );
    yield* emit({ providers: [...accounts, ...programs] });
  }),
).pipe(
  Command.withDescription(
    'Show which providers this machine has an API key for that they still accept, and whether the claude and codex programs are signed in to a subscription',
  ),
);
