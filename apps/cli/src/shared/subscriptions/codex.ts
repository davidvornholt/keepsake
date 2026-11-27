// biome-ignore-all lint/style/useNamingConvention: names of Codex's events
import { Effect, FileSystem, Path, Schema } from 'effect';
import { OpenAiStructuredOutput } from 'effect/ai';
import { ToolFailed } from '../errors/errors.ts';
import { xdgDirectory } from '../xdg.ts';
import type { Program, ProgramQuestion } from './program-model.ts';
import type { Effort } from './subscriptions.ts';
import type { ProgramUsage, UsageCall } from './usage-records.ts';

const isMessage = Schema.is(
  Schema.Struct({
    type: Schema.Literal('item.completed'),
    item: Schema.Struct({
      type: Schema.Literal('agent_message'),
      text: Schema.String,
    }),
  }),
);
const isCompleted = Schema.is(
  Schema.Struct({
    type: Schema.Literal('turn.completed'),
    usage: Schema.Struct({
      input_tokens: Schema.Int,
      cached_input_tokens: Schema.optionalKey(Schema.Int),
      cache_write_input_tokens: Schema.optionalKey(Schema.Int),
      output_tokens: Schema.Int,
      reasoning_output_tokens: Schema.optionalKey(Schema.Int),
    }),
  }),
);
const isFailed = Schema.is(
  Schema.Struct({
    type: Schema.Literal('turn.failed'),
    error: Schema.Struct({ message: Schema.String }),
  }),
);
const isError = Schema.is(
  Schema.Struct({ type: Schema.Literal('error'), message: Schema.String }),
);

/** Everything an agent could do besides looking at the pictures. */
const unneeded = [
  'shell_tool',
  'unified_exec',
  'image_generation',
  'view_image',
  'multi_agent',
  'apps',
  'plugins',
  'goals',
  'hooks',
  'sleep_tool',
  'skill_search',
  'tool_suggest',
  'browser_use',
  'computer_use',
];

/**
 * Codex has a tool left that can't be turned off. Models otherwise spend two
 * more requests on looking around with it before they answer.
 */
const withoutTools =
  'Everything you need is in the question, so answer it right away and call no tools.';

const request = (model: string, effort: Effort) =>
  Effect.fn('codex.request')(
    function* ({ role, pieces, schema, directory }: ProgramQuestion) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instructions = path.join(directory, 'role.md');
      const schemaFile = path.join(directory, 'schema.json');
      yield* fs.writeFileString(instructions, `${role}\n\n${withoutTools}\n`);
      yield* fs.writeFileString(schemaFile, JSON.stringify(schema));
      const pictures: Array<string> = [];
      const texts: Array<string> = [];
      for (const piece of pieces) {
        if (typeof piece === 'string') {
          texts.push(piece);
        } else {
          const file = path.join(directory, `${pictures.length + 1}.jpg`);
          yield* fs.writeFile(file, piece);
          pictures.push(file);
          // Codex takes the pictures apart from the text.
          texts.push(`(the attached picture number ${pictures.length})`);
        }
      }
      return {
        args: [
          'exec',
          '--json',
          ...['--model', model],
          ...['--config', `model_reasoning_effort="${effort}"`],
          ...[
            '--config',
            `model_instructions_file=${JSON.stringify(instructions)}`,
          ],
          ...['--config', 'web_search="disabled"'],
          ...unneeded.flatMap((feature) => ['--disable', feature]),
          ...['--sandbox', 'read-only'],
          ...['--output-schema', schemaFile],
          '--ephemeral',
          '--ignore-user-config',
          '--ignore-rules',
          '--skip-git-repo-check',
          ...pictures.flatMap((file) => ['--image', file]),
          '-',
        ],
        input: texts.join('\n\n'),
      };
    },
    Effect.mapError(({ message }) => new ToolFailed({ message })),
  );

const answer = Effect.fn('codex.answer')(function* (
  events: ReadonlyArray<unknown>,
) {
  const message = events.findLast(isMessage);
  const completed = events.findLast(isCompleted);
  if (message === undefined || completed === undefined) {
    return yield* new ToolFailed({
      message:
        events.findLast(isFailed)?.error.message ??
        events.findLast(isError)?.message ??
        'Codex gave no answer.',
    });
  }
  return {
    text: message.item.text,
    inputTokens: completed.usage.input_tokens,
    outputTokens: completed.usage.output_tokens,
  };
});

/** The lines Codex would write into a session for the turn. */
const usageLines =
  (model: string) =>
  (events: ReadonlyArray<unknown>, { session, id, at }: UsageCall) => {
    const completed = events.findLast(isCompleted);
    if (completed === undefined) {
      return [];
    }
    const { usage } = completed;
    return [
      // Only a file's first one counts, but each call has its own, so that
      // calls written at once can't leave the file without one.
      { timestamp: at, type: 'session_meta', payload: { id: session } },
      { timestamp: at, type: 'turn_context', payload: { model } },
      {
        timestamp: at,
        type: 'token_usage_record',
        payload: {
          response_id: id,
          usage: {
            input_tokens: usage.input_tokens,
            cached_input_tokens: usage.cached_input_tokens ?? 0,
            cache_write_input_tokens: usage.cache_write_input_tokens ?? 0,
            output_tokens: usage.output_tokens,
            reasoning_output_tokens: usage.reasoning_output_tokens ?? 0,
            total_tokens: usage.input_tokens + usage.output_tokens,
          },
        },
      },
    ];
  };

const usage = (model: string): ProgramUsage => ({
  folder: Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(yield* xdgDirectory('CODEX_HOME', '.codex'), 'sessions');
  }),
  lines: usageLines(model),
});

/** Asks Codex, which uses the ChatGPT subscription it is signed in to. */
export const codex = (
  model: string,
  effort: Effort,
): Program<FileSystem.FileSystem | Path.Path> => ({
  subscription: 'codex',
  codecTransformer: OpenAiStructuredOutput.toCodecOpenAI,
  request: request(model, effort),
  answer,
  usage: usage(model),
});
