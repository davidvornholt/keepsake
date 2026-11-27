import { Effect, Fiber, Result, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ToolFailed } from './errors/errors.ts';

/** Reads a stream in the background, keeping what has arrived so far. */
const reading = Effect.fn('reading')(function* <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
) {
  const chunks: Array<Uint8Array> = [];
  const fiber = yield* Effect.forkScoped(
    Stream.runForEach(stream, (chunk) => Effect.sync(() => chunks.push(chunk))),
  );
  return { fiber, read: () => new Uint8Array(Buffer.concat(chunks)) };
});

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
 * Runs a program without a shell and returns what it printed, and its exit
 * code or why it has none, as when a signal stopped it.
 */
export const runToolToEnd = Effect.fn('runToolToEnd')(
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
    const stdout = yield* reading(handle.stdout);
    const stderr = yield* reading(handle.stderr);
    const ending = yield* Effect.result(handle.exitCode);
    const output = Fiber.joinAll([stdout.fiber, stderr.fiber]);
    if (Result.isSuccess(ending)) {
      yield* output;
    } else {
      // The signal may have left the program's own children behind, so they
      // are stopped now, and what they print after this moment is lost.
      yield* Effect.forkScoped(handle.kill());
      yield* Effect.ignore(Effect.timeout(output, drainAfterSignal));
    }
    return {
      stdout: stdout.read(),
      stderr: new TextDecoder().decode(stderr.read()).trim(),
      ending: Result.mapBoth(ending, {
        onSuccess: Number,
        onFailure: (error) => stopped(command, error),
      }),
    };
  },
  Effect.scoped,
  (effect, command) =>
    Effect.mapError(effect, (error) => notRun(command, error)),
);

/**
 * Runs a program without a shell and returns what it printed, whatever its
 * exit code.
 */
export const runTool = Effect.fn('runTool')(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
) {
  const { stdout, stderr, ending } = yield* runToolToEnd(
    command,
    args,
    options,
  );
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
