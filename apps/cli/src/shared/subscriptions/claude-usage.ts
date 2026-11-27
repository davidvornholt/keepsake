// biome-ignore-all lint/style/useNamingConvention: names in Claude Code's events and sessions
import { Effect, Path, Schema } from 'effect';
import { xdgDirectory } from '../xdg.ts';
import type { ProgramUsage, UsageCall } from './usage-records.ts';

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
        costUSD: Schema.optionalKey(Schema.Number),
      }),
    ),
  }),
);

/** A block of a message, which repeats the usage of the message so far. */
const isBlock = Schema.is(
  Schema.Struct({
    type: Schema.Literal('assistant'),
    message: Schema.Struct({
      id: Schema.String,
      model: Schema.String,
      usage: Schema.Struct({
        input_tokens: Schema.Int,
        cache_creation_input_tokens: Schema.optionalKey(Schema.Int),
        cache_read_input_tokens: Schema.optionalKey(Schema.Int),
        output_tokens: Schema.Int,
        cache_creation: Schema.optionalKey(
          Schema.Struct({
            ephemeral_1h_input_tokens: Schema.optionalKey(Schema.Int),
          }),
        ),
      }),
    }),
  }),
);

type Used = {
  readonly model: string;
  readonly input: number;
  readonly cacheCreation: number;
  readonly cacheCreation1h: number;
  readonly cacheRead: number;
  readonly output: number;
  readonly costUsd?: number;
};

const byModel = (events: ReadonlyArray<unknown>) => {
  const spent = events.findLast(isSpent);
  return spent === undefined
    ? undefined
    : Object.entries(spent.modelUsage).map(
        ([model, used]): Used => ({
          model,
          input: used.inputTokens,
          cacheCreation: used.cacheCreationInputTokens,
          cacheCreation1h: used.cacheCreationEphemeral1hInputTokens ?? 0,
          cacheRead: used.cacheReadInputTokens,
          output: used.outputTokens,
          ...(used.costUSD !== undefined && Number.isFinite(used.costUSD)
            ? { costUsd: used.costUSD }
            : {}),
        }),
      );
};

/**
 * What the messages used, for an answer that ended before its result. Each
 * message counts once, with the most of each kind of token its blocks name.
 */
const byMessage = (events: ReadonlyArray<unknown>) => {
  const messages = new Map<string, Used>();
  for (const { message } of events.filter(isBlock)) {
    const { usage } = message;
    const block: Used = {
      model: message.model,
      input: usage.input_tokens,
      cacheCreation: usage.cache_creation_input_tokens ?? 0,
      cacheCreation1h: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      output: usage.output_tokens,
    };
    const seen = messages.get(message.id) ?? block;
    messages.set(message.id, {
      model: block.model,
      input: Math.max(seen.input, block.input),
      cacheCreation: Math.max(seen.cacheCreation, block.cacheCreation),
      cacheCreation1h: Math.max(seen.cacheCreation1h, block.cacheCreation1h),
      cacheRead: Math.max(seen.cacheRead, block.cacheRead),
      output: Math.max(seen.output, block.output),
    });
  }
  return [...messages.values()];
};

/** One line for each model, as Claude Code writes its answers into a session. */
const usageLines = (
  events: ReadonlyArray<unknown>,
  { session, at }: UsageCall,
) =>
  (byModel(events) ?? byMessage(events)).map((used) => ({
    type: 'assistant',
    timestamp: at,
    sessionId: session,
    ...(used.costUsd === undefined ? {} : { costUSD: used.costUsd }),
    message: {
      model: used.model,
      usage: {
        input_tokens: used.input,
        cache_creation_input_tokens: used.cacheCreation,
        cache_read_input_tokens: used.cacheRead,
        output_tokens: used.output,
        cache_creation: { ephemeral_1h_input_tokens: used.cacheCreation1h },
      },
    },
  }));

export const claudeUsage: ProgramUsage = {
  folder: Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(
      yield* xdgDirectory('CLAUDE_CONFIG_DIR', '.claude'),
      'projects',
    );
  }),
  lines: usageLines,
};
