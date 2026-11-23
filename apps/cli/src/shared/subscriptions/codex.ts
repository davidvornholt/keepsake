// biome-ignore-all lint/style/useNamingConvention: names of Codex's events
import { Effect, FileSystem, Path, Schema } from 'effect';
import { OpenAiStructuredOutput } from 'effect/ai';
import { ToolFailed } from '../errors/errors.ts';
import type { Program, ProgramQuestion } from './program-model.ts';

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
      output_tokens: Schema.Int,
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
];

const request = (model: string) =>
  Effect.fn('codex.request')(
    function* ({ role, pieces, schema, directory }: ProgramQuestion) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instructions = path.join(directory, 'role.md');
      const schemaFile = path.join(directory, 'schema.json');
      yield* fs.writeFileString(instructions, role);
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
          ...['--config', 'model_reasoning_effort="medium"'],
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

/** Asks Codex, which uses the ChatGPT subscription it is signed in to. */
export const codex = (
  model: string,
): Program<FileSystem.FileSystem | Path.Path> => ({
  subscription: 'codex',
  codecTransformer: OpenAiStructuredOutput.toCodecOpenAI,
  request: request(model),
  answer,
});
