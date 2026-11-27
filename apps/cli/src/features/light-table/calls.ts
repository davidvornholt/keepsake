import { Effect, Option, Schema } from 'effect';
import { runTool } from '../../shared/tools.ts';

// The page's server runs keepsake itself for what costs it nothing to start,
// with the program that keepsake was started with.

const Failure = Schema.fromJsonString(
  Schema.Struct({
    error: Schema.Struct({
      tag: Schema.optionalKey(Schema.String),
      message: Schema.String,
    }),
  }),
);

/** What a keepsake command says about why it failed. */
export const failureIn = (
  stderr: string,
): { readonly tag: string; readonly message: string } => {
  const [last] = stderr
    .split('\n')
    .toReversed()
    .flatMap((line) =>
      Option.toArray(Schema.decodeUnknownOption(Failure)(line)),
    );
  return last === undefined
    ? { tag: 'Unknown', message: 'It ended unexpectedly.' }
    : { tag: last.error.tag ?? 'Unknown', message: last.error.message };
};

/** What came of a keepsake command: what it printed, or why it failed. */
export type Called =
  | { readonly kind: 'done'; readonly output: string }
  | { readonly kind: 'failed'; readonly tag: string; readonly message: string };

/** Runs keepsake commands with the program that keepsake itself is started with. */
export const callerOf =
  ([command = '', ...first]: ReadonlyArray<string>) =>
  (args: ReadonlyArray<string>) =>
    runTool(command, [...first, ...args]).pipe(
      Effect.map(
        ({ exitCode, stdout, stderr }): Called =>
          exitCode === 0
            ? { kind: 'done', output: new TextDecoder().decode(stdout) }
            : { kind: 'failed', ...failureIn(stderr) },
      ),
      Effect.catchTag('ToolFailed', ({ message }) =>
        Effect.succeed<Called>({ kind: 'failed', tag: 'ToolFailed', message }),
      ),
    );
export type Caller = ReturnType<typeof callerOf>;
