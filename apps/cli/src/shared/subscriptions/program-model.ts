import { Effect, FileSystem, Layer, Result, Schema, Stream } from 'effect';
import {
  AiError,
  LanguageModel,
  type Prompt,
  type Response,
  Tool,
} from 'effect/ai';
import type { ChildProcessSpawner } from 'effect/process';
import { ToolFailed } from '../errors/errors.ts';
import { runToolToEnd } from '../tools.ts';
import {
  requireSubscription,
  type Subscription,
  withoutApiKeys,
} from './subscriptions.ts';
import { type ProgramUsage, usageRecorder } from './usage-records.ts';

/** One question for a program, in the words it needs. */
export type ProgramQuestion = {
  readonly role: string;
  readonly pieces: ReadonlyArray<string | Uint8Array>;
  /** The JSON schema of the answer. */
  readonly schema: object;
  /** An empty directory only this question uses. */
  readonly directory: string;
};

export type ProgramAnswer = {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

/** How a program is asked, and how its answer is read. */
export type Program<R> = {
  readonly subscription: Subscription;
  readonly codecTransformer: LanguageModel.CodecTransformer;
  readonly request: (
    question: ProgramQuestion,
  ) => Effect.Effect<
    { readonly args: ReadonlyArray<string>; readonly input: string },
    ToolFailed,
    R
  >;
  /** Reads the events the program printed, one JSON value in each line. */
  readonly answer: (
    events: ReadonlyArray<unknown>,
  ) => Effect.Effect<ProgramAnswer, ToolFailed>;
  readonly usage: ProgramUsage;
};

const Line = Schema.fromJsonString(Schema.Unknown);

/**
 * The events in what a program printed, and the first line that isn't one,
 * such as a last line cut off when the program stopped.
 */
const eventsIn = Effect.fn('eventsIn')(function* (text: string) {
  const read = yield* Effect.forEach(
    text.split('\n').filter((line) => line.startsWith('{')),
    (line) => Effect.result(Schema.decodeUnknownEffect(Line)(line)),
  );
  return {
    events: read.flatMap((line) =>
      Result.isSuccess(line) ? [line.success] : [],
    ),
    unread: read.find(Result.isFailure)?.failure,
  };
});

const roleOf = (prompt: Prompt.Prompt): string =>
  prompt.content
    .flatMap((message) => (message.role === 'system' ? [message.content] : []))
    .join('\n\n');

const piecesOf = (prompt: Prompt.Prompt): Array<string | Uint8Array> =>
  prompt.content.flatMap((message) =>
    message.role === 'user'
      ? message.content.flatMap((part): Array<string | Uint8Array> => {
          if (part.type === 'text') {
            return [part.text];
          }
          return part.data instanceof Uint8Array ? [part.data] : [];
        })
      : [],
  );

const responseParts = ({
  text,
  inputTokens,
  outputTokens,
}: ProgramAnswer): Array<Response.PartEncoded> => [
  { type: 'text', text },
  {
    type: 'finish',
    reason: 'stop',
    usage: {
      inputTokens: { total: inputTokens },
      outputTokens: { total: outputTokens },
    },
  },
];

/** A model that answers through a program on this machine. */
export const programModelLayer = <R>(program: Program<R>) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    Effect.gen(function* () {
      const { subscription, codecTransformer } = program;
      yield* requireSubscription(subscription);
      const recordUsage = yield* usageRecorder(program.usage);
      const services = yield* Effect.context<
        R | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
      >();
      const failed = ({ message }: { readonly message: string }) =>
        AiError.make({
          module: 'keepsake',
          method: subscription,
          // The programs try again themselves, so this is not retried.
          reason: new AiError.UnknownError({ description: message }),
        });
      const ask = Effect.fn('ProgramModel.ask')(
        function* ({ prompt, responseFormat }: LanguageModel.ProviderOptions) {
          if (responseFormat.type !== 'json') {
            return yield* new ToolFailed({
              message: 'Only questions with a JSON answer are supported.',
            });
          }
          const fs = yield* FileSystem.FileSystem;
          // The pictures are private, and this directory is owner-only.
          const directory = yield* fs.makeTempDirectoryScoped({
            prefix: 'keepsake-',
          });
          const { args, input } = yield* program.request({
            role: roleOf(prompt),
            pieces: piecesOf(prompt),
            schema: Tool.getJsonSchemaFromSchema(responseFormat.schema, {
              transformer: codecTransformer,
            }),
            directory,
          });
          const { stdout, stderr, ending } = yield* runToolToEnd(
            subscription,
            args,
            { input, cwd: directory, env: withoutApiKeys },
          );
          const { events, unread } = yield* eventsIn(
            new TextDecoder().decode(stdout),
          );
          // A failed answer, or one a signal cut short, may have used tokens
          // too, so its usage is recorded before it fails.
          yield* recordUsage(events);
          const exitCode = yield* Effect.fromResult(ending);
          if (unread !== undefined) {
            return yield* unread;
          }
          if (events.length === 0) {
            return yield* new ToolFailed({
              message: `exit code ${exitCode}. ${stderr}`,
            });
          }
          return responseParts(yield* program.answer(events));
        },
        Effect.scoped,
        Effect.mapError(failed),
        Effect.provide(services),
      );
      return yield* LanguageModel.make({
        codecTransformer,
        generateText: ask,
        streamText: () =>
          Stream.fail(failed({ message: 'Streaming is not supported.' })),
      });
    }),
  );
