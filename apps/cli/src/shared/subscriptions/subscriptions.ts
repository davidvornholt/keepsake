// biome-ignore-all lint/style/useNamingConvention: names of environment variables
import { Effect, Schema } from 'effect';
import { NotSignedIn } from '../errors/errors.ts';
import { runTool } from '../tools.ts';

/** Assistants whose program answers on the subscription it is signed in to. */
export const subscriptions = ['claude', 'codex'] as const;
export type Subscription = (typeof subscriptions)[number];

export const isSubscription = (name: string): name is Subscription =>
  (subscriptions as ReadonlyArray<string>).includes(name);

/** With one of these set, the programs would bill an API key instead. */
export const withoutApiKeys = {
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_AUTH_TOKEN: undefined,
  ANTHROPIC_BASE_URL: undefined,
  CLAUDE_CODE_USE_BEDROCK: undefined,
  CLAUDE_CODE_USE_FOUNDRY: undefined,
  CLAUDE_CODE_USE_VERTEX: undefined,
  CODEX_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  OPENAI_BASE_URL: undefined,
};

const ClaudeStatus = Schema.fromJsonString(
  Schema.Struct({
    loggedIn: Schema.Boolean,
    authMethod: Schema.optionalKey(Schema.String),
  }),
);

const statusCommands = {
  claude: ['auth', 'status'],
  codex: ['login', 'status'],
} satisfies Record<Subscription, ReadonlyArray<string>>;

/** Whether the program is there and signed in to a subscription. */
export const isSignedInTo = Effect.fn('isSignedInTo')(
  function* (name: Subscription) {
    const { stdout, stderr, exitCode } = yield* runTool(
      name,
      statusCommands[name],
      { env: withoutApiKeys },
    );
    const text = new TextDecoder().decode(stdout);
    if (name === 'codex') {
      return exitCode === 0 && `${text}${stderr}`.includes('using ChatGPT');
    }
    const status = yield* Schema.decodeUnknownEffect(ClaudeStatus)(text);
    return status.loggedIn && status.authMethod === 'claude.ai';
  },
  Effect.orElseSucceed(() => false),
);

const signIn = {
  claude:
    'Claude Code is not signed in to a Claude subscription on this machine. Install it, run `claude`, and sign in.',
  codex:
    'Codex is not signed in with ChatGPT on this machine. Install it and run `codex login`.',
} satisfies Record<Subscription, string>;

export const requireSubscription = Effect.fn('requireSubscription')(function* (
  name: Subscription,
) {
  if (!(yield* isSignedInTo(name))) {
    return yield* new NotSignedIn({ message: signIn[name] });
  }
});
