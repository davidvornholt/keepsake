// biome-ignore-all lint/style/useNamingConvention: names of Claude Code's events
import { Effect, Path, Schema } from 'effect';
import { AnthropicStructuredOutput } from 'effect/ai';
import { ToolFailed } from '../errors/errors.ts';
import { xdgDirectory } from '../xdg.ts';
import type { Program, ProgramQuestion } from './program-model.ts';
import type { Effort } from './subscriptions.ts';
import type { ProgramUsage, UsageCall } from './usage-records.ts';

const Result = Schema.Struct({
  type: Schema.Literal('result'),
  is_error: Schema.Boolean,
  result: Schema.optionalKey(Schema.String),
  structured_output: Schema.optionalKey(Schema.Unknown),
  usage: Schema.Struct({
    input_tokens: Schema.Int,
    cache_creation_input_tokens: Schema.Int,
    cache_read_input_tokens: Schema.Int,
    output_tokens: Schema.Int,
  }),
});
const isResult = Schema.is(Result);

/** What each model used for the answer, including calls `usage` leaves out. */
const isSpent = Schema.is(
  Schema.Struct({
    type: Schema.Literal('result'),
    modelUsage: Schema.Record(
      Schema.String,
      Schema.Struct({
        inputTokens: Schema.Int,
        outputTokens: Schema.Int,
        cacheReadInputTokens: Schema.Int,
        cacheCreationInputTokens: Schema.Int,
        cacheCreationEphemeral1hInputTokens: Schema.optionalKey(Schema.Int),
      }),
    ),
  }),
);

const content = (piece: string | Uint8Array) =>
  typeof piece === 'string'
    ? { type: 'text', text: piece }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: Buffer.from(piece).toString('base64'),
        },
      };

const request =
  (model: string, effort: Effort) =>
  ({ role, pieces, schema }: ProgramQuestion) =>
    Effect.succeed({
      args: [
        '--print',
        ...['--model', model],
        ...['--effort', effort],
        ...['--input-format', 'stream-json'],
        ...['--output-format', 'stream-json', '--verbose'],
        ...['--system-prompt', role],
        ...['--json-schema', JSON.stringify(schema)],
        // It only looks and answers: no tools, no instructions or settings of
        // this machine, and no session file that would keep the photos.
        ...['--tools', ''],
        '--safe-mode',
        '--no-session-persistence',
      ],
      input: `${JSON.stringify({
        type: 'user',
        message: { role: 'user', content: pieces.map(content) },
      })}\n`,
    });

const answer = Effect.fn('claude.answer')(function* (
  events: ReadonlyArray<unknown>,
) {
  const result = events.findLast(isResult);
  if (result === undefined || result.is_error) {
    return yield* new ToolFailed({
      message: result?.result ?? 'Claude Code gave no answer.',
    });
  }
  const { usage } = result;
  return {
    text: JSON.stringify(result.structured_output ?? null),
    inputTokens:
      usage.input_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens,
    outputTokens: usage.output_tokens,
  };
});

/** One line for each model, as Claude Code writes its answers into a session. */
const usageLines = (
  events: ReadonlyArray<unknown>,
  { session, at }: UsageCall,
) =>
  Object.entries(events.findLast(isSpent)?.modelUsage ?? {}).map(
    ([model, used]) => ({
      type: 'assistant',
      timestamp: at,
      sessionId: session,
      message: {
        model,
        usage: {
          input_tokens: used.inputTokens,
          cache_creation_input_tokens: used.cacheCreationInputTokens,
          cache_read_input_tokens: used.cacheReadInputTokens,
          output_tokens: used.outputTokens,
          cache_creation: {
            ephemeral_1h_input_tokens:
              used.cacheCreationEphemeral1hInputTokens ?? 0,
          },
        },
      },
    }),
  );

const usage: ProgramUsage = {
  folder: Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(
      yield* xdgDirectory('CLAUDE_CONFIG_DIR', '.claude'),
      'projects',
    );
  }),
  lines: usageLines,
};

/** Asks Claude Code, which uses the Claude subscription it is signed in to. */
export const claude = (model: string, effort: Effort): Program<never> => ({
  subscription: 'claude',
  codecTransformer: AnthropicStructuredOutput.toCodecAnthropic,
  request: request(model, effort),
  answer,
  usage,
});
