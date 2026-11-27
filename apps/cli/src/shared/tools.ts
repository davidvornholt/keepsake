import type { PlatformError } from 'effect';
import { Data, Effect, Result, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ToolFailed } from './errors/errors.ts';

/** Keeps each chunk of a program's output as it arrives. */
const keep = (chunks: Array<Uint8Array>) => (chunk: Uint8Array) =>
  Effect.sync(() => {
    chunks.push(chunk);
  });

/** A program that ran but has no exit code, as when a signal stopped it. */
class Stopped extends Data.TaggedError('Stopped')<{
  readonly error: PlatformError.PlatformError;
}> {}

/**
 * How long to keep reading a program a signal stopped. A program it started
 * may still hold its output open, so its end is not awaited.
 */
const drainAfterSignal = '200 millis';

/** How much of a failing program's error output goes into the message. */
const shownError = 400;

const failed = (command: string, detail: string) =>
  new ToolFailed({ message: `${command} failed: ${detail}` });

type RunOptions = {
  /** What the program reads from its standard input. */
  readonly input?: string | Uint8Array;
  readonly cwd?: string;
  /** Environment variables to set, or to remove if undefined. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

const notRun = (command: string, { message }: { readonly message: string }) =>
  failed(command, `${message}. Is ${command} installed and on the PATH?`);

/** Why a program that ran has no exit code, such as the signal that stopped it. */
const stopped = (
  command: string,
  error: { readonly message: string; readonly cause?: unknown },
) =>
  failed(
    command,
    error.cause instanceof Error ? error.cause.message : error.message,
  );

/**
 * Both entry points run this untraced, so that each run of a program pays for
 * one span, as tests run thousands of them.
 */
const toEnd = Effect.fnUntraced(
  function* (
    command: string,
    args: ReadonlyArray<string>,
    { input, cwd, env }: RunOptions = {},
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, [...args], {
        stdin:
          input === undefined
            ? 'ignore'
            : Stream.make(
                typeof input === 'string'
                  ? new TextEncoder().encode(input)
                  : input,
              ),
        cwd,
        env: { ...env },
        extendEnv: true,
      }),
    );
    const out: Array<Uint8Array> = [];
    const err: Array<Uint8Array> = [];
    const ran = yield* Effect.all(
      [
        Stream.runForEach(handle.stdout, keep(out)),
        Stream.runForEach(handle.stderr, keep(err)),
        // The signal may have left the program's own children behind, holding
        // its output open, so they are stopped now, and the output is read for
        // a moment more. Failing then stops the reading.
        Effect.catch(handle.exitCode, (error) =>
          Effect.forkScoped(handle.kill()).pipe(
            Effect.andThen(Effect.sleep(drainAfterSignal)),
            Effect.andThen(Effect.fail(new Stopped({ error }))),
          ),
        ),
      ],
      { concurrency: 'unbounded' },
    ).pipe(
      Effect.map(([, , code]) => Result.succeed(Number(code))),
      Effect.catchTag('Stopped', ({ error }) =>
        Effect.succeed(Result.fail(stopped(command, error))),
      ),
    );
    return {
      stdout: new Uint8Array(Buffer.concat(out)),
      stderr: new TextDecoder().decode(Buffer.concat(err)).trim(),
      ending: ran,
    };
  },
  Effect.scoped,
  (effect, command) =>
    Effect.mapError(effect, (error) => notRun(command, error)),
);

/**
 * Runs a program without a shell and returns what it printed, and its exit
 * code or why it has none, as when a signal stopped it.
 */
export const runToolToEnd = Effect.fn('runToolToEnd')(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
) {
  return yield* toEnd(command, args, options);
});

/**
 * Runs a program without a shell and returns what it printed, whatever its
 * exit code.
 */
export const runTool = Effect.fn('runTool')(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
) {
  const { stdout, stderr, ending } = yield* toEnd(command, args, options);
  return { stdout, stderr, exitCode: yield* Effect.fromResult(ending) };
});

/** Runs a program that must succeed and returns the bytes it printed. */
export const toolBytes = Effect.fn('toolBytes')(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
) {
  const { stdout, stderr, exitCode } = yield* runTool(command, args, options);
  if (exitCode !== 0) {
    return yield* failed(
      command,
      stderr === '' ? `exit code ${exitCode}` : stderr.slice(0, shownError),
    );
  }
  return stdout;
});

/** Runs a program that must succeed and returns the text it printed. */
export const toolText = (command: string, args: ReadonlyArray<string>) =>
  Effect.map(toolBytes(command, args), (bytes) =>
    new TextDecoder().decode(bytes),
  );
